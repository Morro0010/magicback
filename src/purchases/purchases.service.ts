import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';

const PURCHASE_INCLUDE = {
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
} satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPurchases(query: ListPurchasesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.PurchaseWhereInput = {
      OR: search
        ? [
            { folio: { contains: search, mode: 'insensitive' } },
            { supplierName: { contains: search, mode: 'insensitive' } },
            { reference: { contains: search, mode: 'insensitive' } },
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

    const [total, aggregate, purchases] = await this.prisma.$transaction([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.aggregate({ where, _sum: { totalCost: true } }),
      this.prisma.purchase.findMany({
        where,
        include: {
          createdByUser: PURCHASE_INCLUDE.createdByUser,
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
        totalCost: aggregate._sum.totalCost?.toNumber() ?? 0,
      },
      items: purchases.map((purchase) => this.toResponse(purchase)),
    };
  }

  async getPurchaseById(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    return this.toResponse(purchase);
  }

  async createPurchase(
    dto: CreatePurchaseDto,
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

    const updateProductCost = Boolean(dto.updateProductCost);
    if (updateProductCost && actor.role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'Solo ADMIN puede cambiar costo base del producto',
      );
    }

    const grouped = dto.items.reduce<
      Record<string, { quantity: number; unitCostPrice: number }>
    >((acc, item) => {
      if (!acc[item.productId]) {
        acc[item.productId] = {
          quantity: 0,
          unitCostPrice: item.unitCostPrice,
        };
      }
      acc[item.productId].quantity += item.quantity;
      acc[item.productId].unitCostPrice = item.unitCostPrice;
      return acc;
    }, {});

    const products = await this.prisma.product.findMany({
      where: { id: { in: Object.keys(grouped) } },
      orderBy: { name: 'asc' },
    });

    if (products.length !== Object.keys(grouped).length) {
      throw new BadRequestException('Uno o más productos no existen');
    }

    const byId = new Map(products.map((product) => [product.id, product]));

    const lines = Object.entries(grouped).map(([productId, line]) => {
      const product = byId.get(productId);
      if (!product) {
        throw new BadRequestException('Producto inválido');
      }

      const subtotal = Number((line.quantity * line.unitCostPrice).toFixed(2));
      return {
        product,
        quantity: line.quantity,
        unitCostPrice: line.unitCostPrice,
        subtotal,
      };
    });

    const totalCost = Number(
      lines.reduce((acc, line) => acc + line.subtotal, 0).toFixed(2),
    );
    const folio = this.buildFolio();

    const createdPurchase = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          folio,
          supplierName: dto.supplierName.trim(),
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          totalCost,
          createdByUserId: actor.id,
        },
      });

      for (const line of lines) {
        const previousStock = line.product.stockCurrent;
        const newStock = previousStock + line.quantity;

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: line.product.id,
            productNameSnapshot: line.product.name,
            unitSnapshot: line.product.unit,
            quantity: line.quantity,
            unitCostPrice: line.unitCostPrice,
            subtotal: line.subtotal,
          },
        });

        await tx.product.update({
          where: { id: line.product.id },
          data: {
            stockCurrent: newStock,
            updatedByUserId: actor.id,
            costPrice: updateProductCost ? line.unitCostPrice : undefined,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: line.product.id,
            type: InventoryMovementType.PURCHASE_IN,
            quantity: line.quantity,
            previousStock,
            newStock,
            reason: `Compra ${purchase.folio}`,
            actorUserId: actor.id,
            purchaseId: purchase.id,
            unitCostPrice: line.unitCostPrice,
          },
        });
      }

      return tx.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: PURCHASE_INCLUDE,
      });
    });

    await this.auditService.log({
      eventType: 'PURCHASE_CREATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        purchaseId: createdPurchase.id,
        folio: createdPurchase.folio,
        supplierName: createdPurchase.supplierName,
        totalCost: createdPurchase.totalCost.toNumber(),
        updateProductCost,
      },
    });

    return this.toResponse(createdPurchase);
  }

  private toResponse(purchase: {
    id: string;
    folio: string;
    supplierName: string;
    reference: string | null;
    notes: string | null;
    totalCost: { toNumber: () => number };
    createdByUserId: string;
    createdByUser: { id: string; name: string; email: string; role: UserRole };
    items?: Array<{
      id: string;
      purchaseId: string;
      productId: string;
      productNameSnapshot: string;
      unitSnapshot: string;
      quantity: number;
      unitCostPrice: { toNumber: () => number };
      subtotal: { toNumber: () => number };
      createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: purchase.id,
      folio: purchase.folio,
      supplierName: purchase.supplierName,
      reference: purchase.reference,
      notes: purchase.notes,
      totalCost: purchase.totalCost.toNumber(),
      createdByUserId: purchase.createdByUserId,
      createdByUser: purchase.createdByUser,
      items: (purchase.items ?? []).map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        productId: item.productId,
        productName: item.productNameSnapshot,
        unit: item.unitSnapshot,
        quantity: item.quantity,
        unitCostPrice: item.unitCostPrice.toNumber(),
        subtotal: item.subtotal.toNumber(),
        createdAt: item.createdAt,
      })),
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  private buildFolio() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 90000 + 10000);
    return `C-${yyyy}${mm}${dd}-${rand}`;
  }
}
