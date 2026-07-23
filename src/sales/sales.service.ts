import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  NotificationType,
  PaymentMethod,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { normalizePhoneNumber } from '../common/utils/phone.util';
import { posTicketTemplate } from '../messaging/whatsapp-message.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SendSaleWhatsAppDto } from './dto/send-sale-whatsapp.dto';

const SALE_INCLUDE = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  items: {
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async listSales(query: ListSalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.SaleWhereInput = {
      paymentMethod: query.paymentMethod,
      OR: search
        ? [
            { folio: { contains: search, mode: 'insensitive' } },
            { customerPhone: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, aggregate, forcedCount, sales] =
      await this.prisma.$transaction([
        this.prisma.sale.count({ where }),
        this.prisma.sale.aggregate({ where, _sum: { total: true } }),
        this.prisma.sale.count({ where: { ...where, forcedByAdmin: true } }),
        this.prisma.sale.findMany({
          where,
          include: {
            createdByUser: SALE_INCLUDE.createdByUser,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

    return {
      page,
      limit,
      total,
      summary: {
        totalSales: aggregate._sum.total?.toNumber() ?? 0,
        forcedCount,
      },
      items: sales.map((sale) => this.toResponse(sale)),
    };
  }

  async getSaleById(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: SALE_INCLUDE,
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    return this.toResponse(sale);
  }

  async createSale(
    dto: CreateSaleDto,
    actor: {
      id: string;
      role: UserRole;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    if (!dto.items.length) {
      throw new BadRequestException('Debes agregar al menos un producto');
    }

    const forceNegativeRequested = Boolean(dto.forceNegativeStock);
    if (forceNegativeRequested && actor.role !== UserRole.ADMIN) {
      throw new BadRequestException('Solo ADMIN puede forzar sobreventa');
    }

    const groupedItems = dto.items.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.productId] = (acc[item.productId] ?? 0) + item.quantity;
        return acc;
      },
      {},
    );

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: Object.keys(groupedItems) },
      },
      orderBy: { name: 'asc' },
    });

    if (products.length !== Object.keys(groupedItems).length) {
      throw new BadRequestException('Uno o más productos no existen');
    }

    const byId = new Map(products.map((product) => [product.id, product]));

    for (const product of products) {
      if (!product.isActive) {
        throw new BadRequestException(`Producto inactivo: ${product.name}`);
      }
    }

    const lineItems = Object.entries(groupedItems).map(
      ([productId, quantity]) => {
        const product = byId.get(productId);
        if (!product) {
          throw new BadRequestException('Producto no encontrado en carrito');
        }

        const forcedForItem = product.stockCurrent < quantity;
        if (forcedForItem && !forceNegativeRequested) {
          throw new BadRequestException(
            `Stock insuficiente para ${product.name}. Disponible: ${product.stockCurrent}`,
          );
        }

        if (forcedForItem && actor.role !== UserRole.ADMIN) {
          throw new BadRequestException(
            `Solo ADMIN puede forzar sobreventa en ${product.name}`,
          );
        }

        const unitSalePrice = product.salePrice.toNumber();
        const unitCostPrice = product.costPrice.toNumber();
        const subtotal = Number((unitSalePrice * quantity).toFixed(2));

        return {
          product,
          quantity,
          forcedForItem,
          unitSalePrice,
          unitCostPrice,
          subtotal,
        };
      },
    );

    const subtotal = Number(
      lineItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2),
    );

    const folio = this.buildFolio();

    const createdSale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          folio,
          paymentMethod: dto.paymentMethod,
          subtotal,
          total: subtotal,
          forcedByAdmin: lineItems.some((item) => item.forcedForItem),
          customerPhone: dto.customerPhone?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdByUserId: actor.id,
        },
      });

      for (const item of lineItems) {
        const previousStock = item.product.stockCurrent;
        const newStock = previousStock - item.quantity;

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.product.id,
            productNameSnapshot: item.product.name,
            skuSnapshot: item.product.sku,
            categorySnapshot: item.product.category,
            unitSnapshot: item.product.unit,
            quantity: item.quantity,
            unitSalePrice: item.unitSalePrice,
            unitCostPrice: item.unitCostPrice,
            subtotal: item.subtotal,
            forcedNegativeStock: item.forcedForItem,
          },
        });

        await tx.product.update({
          where: { id: item.product.id },
          data: {
            stockCurrent: newStock,
            updatedByUserId: actor.id,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.product.id,
            type: item.forcedForItem
              ? InventoryMovementType.ADMIN_FORCED_SALE
              : InventoryMovementType.SALE_OUT,
            quantity: -item.quantity,
            previousStock,
            newStock,
            forcedByAdmin: item.forcedForItem,
            actorUserId: actor.id,
            saleId: sale.id,
            unitSalePrice: item.unitSalePrice,
            unitCostPrice: item.unitCostPrice,
            reason: item.forcedForItem
              ? 'Sobreventa forzada por ADMIN'
              : 'Venta POS',
          },
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: SALE_INCLUDE,
      });
    });

    await this.notificationsService.createNotification({
      type: NotificationType.POS_SALE_CREATED,
      title: 'Venta POS registrada',
      message: `Venta ${createdSale.folio} por ${createdSale.total.toNumber().toFixed(2)}`,
      relatedSaleId: createdSale.id,
      channels: ['INTERNAL'],
      actorUserId: actor.id,
    });

    const lowStockProducts = lineItems
      .map((item) => ({
        name: item.product.name,
        stockMin: item.product.stockMin,
        newStock: item.product.stockCurrent - item.quantity,
      }))
      .filter(
        (product) =>
          product.stockMin !== null && product.newStock <= product.stockMin,
      );

    for (const product of lowStockProducts) {
      await this.notificationsService.createNotification({
        type: NotificationType.LOW_STOCK_ALERT,
        title: 'Alerta de stock bajo',
        message: `${product.name} quedó en ${product.newStock} unidades`,
        channels: ['INTERNAL'],
        actorUserId: actor.id,
      });
    }

    if (dto.sendWhatsApp) {
      const phone = normalizePhoneNumber(dto.customerPhone ?? null);
      if (phone) {
        await this.notificationsService.createNotification({
          type: NotificationType.POS_TICKET_WHATSAPP,
          title: 'Ticket preparado para WhatsApp',
          message: this.buildTicketSummaryMessage({
            folio: createdSale.folio,
            total: createdSale.total.toNumber(),
            paymentMethod: createdSale.paymentMethod,
          }),
          relatedSaleId: createdSale.id,
          channels: ['INTERNAL', 'WHATSAPP'],
          whatsapp: {
            to: phone,
            text: this.buildTicketSummaryMessage({
              folio: createdSale.folio,
              total: createdSale.total.toNumber(),
              paymentMethod: createdSale.paymentMethod,
            }),
          },
          actorUserId: actor.id,
        });
      }
    }

    await this.auditService.log({
      eventType: 'POS_SALE_CREATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        saleId: createdSale.id,
        folio: createdSale.folio,
        total: createdSale.total.toNumber(),
        paymentMethod: createdSale.paymentMethod,
        forcedByAdmin: createdSale.forcedByAdmin,
      },
    });

    return this.toResponse(createdSale);
  }

  async sendTicketByWhatsApp(
    saleId: string,
    dto: SendSaleWhatsAppDto,
    actor: {
      id: string;
      role: UserRole;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: SALE_INCLUDE,
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    const destination = normalizePhoneNumber(
      dto.phone ?? sale.customerPhone ?? null,
    );
    if (!destination) {
      throw new BadRequestException(
        'Número de WhatsApp inválido o no disponible',
      );
    }

    const message = this.buildTicketSummaryMessage({
      folio: sale.folio,
      total: sale.total.toNumber(),
      paymentMethod: sale.paymentMethod,
    });

    const result = await this.notificationsService.createNotification({
      type: NotificationType.POS_TICKET_WHATSAPP,
      title: 'Ticket POS preparado para WhatsApp',
      message,
      relatedSaleId: sale.id,
      channels: ['INTERNAL', 'WHATSAPP'],
      whatsapp: {
        to: destination,
        text: message,
      },
      actorUserId: actor.id,
    });

    await this.auditService.log({
      eventType: 'POS_TICKET_WHATSAPP_REQUESTED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        saleId: sale.id,
        folio: sale.folio,
        destination,
      },
    });

    return {
      ok: true,
      notificationId: result.id,
      deliveries: result.deliveries,
    };
  }

  private toResponse(sale: {
    id: string;
    folio: string;
    paymentMethod: PaymentMethod;
    subtotal: { toNumber: () => number };
    total: { toNumber: () => number };
    forcedByAdmin: boolean;
    customerPhone: string | null;
    notes: string | null;
    createdByUserId: string;
    createdByUser: { id: string; name: string; email: string; role: UserRole };
    items?: Array<{
      id: string;
      saleId: string;
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string | null;
      categorySnapshot: string;
      unitSnapshot: string;
      quantity: number;
      unitSalePrice: { toNumber: () => number };
      unitCostPrice: { toNumber: () => number };
      subtotal: { toNumber: () => number };
      forcedNegativeStock: boolean;
      createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: sale.id,
      folio: sale.folio,
      paymentMethod: sale.paymentMethod,
      subtotal: sale.subtotal.toNumber(),
      total: sale.total.toNumber(),
      forcedByAdmin: sale.forcedByAdmin,
      customerPhone: sale.customerPhone,
      notes: sale.notes,
      createdByUserId: sale.createdByUserId,
      createdByUser: sale.createdByUser,
      items: (sale.items ?? []).map((item) => ({
        id: item.id,
        saleId: item.saleId,
        productId: item.productId,
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        category: item.categorySnapshot,
        unit: item.unitSnapshot,
        quantity: item.quantity,
        unitSalePrice: item.unitSalePrice.toNumber(),
        unitCostPrice: item.unitCostPrice.toNumber(),
        subtotal: item.subtotal.toNumber(),
        forcedNegativeStock: item.forcedNegativeStock,
        createdAt: item.createdAt,
      })),
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  private buildFolio() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 90000 + 10000);
    return `V-${yyyy}${mm}${dd}-${rand}`;
  }

  private buildTicketSummaryMessage(input: {
    folio: string;
    total: number;
    paymentMethod: PaymentMethod;
  }) {
    return posTicketTemplate(input);
  }
}
