import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { ListInventoryMovementsQueryDto } from './dto/list-inventory-movements-query.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listMovements(query: ListInventoryMovementsQueryDto) {
    const limit = query.limit ?? 25;
    const where: Prisma.InventoryMovementWhereInput = {
      productId: query.productId,
      type: query.type,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [rowsWithLookahead, grouped, forcedCount] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
          actor: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : 0,
        take: limit + 1,
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['type'],
        where,
        _sum: { quantity: true },
      }),
      this.prisma.inventoryMovement.count({
        where: { ...where, forcedByAdmin: true },
      }),
    ]);
    const hasMore = rowsWithLookahead.length > limit;
    const rows = hasMore
      ? rowsWithLookahead.slice(0, limit)
      : rowsWithLookahead;
    const entradas = grouped
      .map((row) => row._sum.quantity ?? 0)
      .filter((quantity) => quantity > 0)
      .reduce((sum, quantity) => sum + quantity, 0);
    const salidas = grouped
      .map((row) => row._sum.quantity ?? 0)
      .filter((quantity) => quantity < 0)
      .reduce((sum, quantity) => sum + Math.abs(quantity), 0);

    return {
      nextCursor: hasMore ? (rows.at(-1)?.id ?? null) : null,
      hasMore,
      summary: { entradas, salidas, forcedCount },
      items: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.product.name,
        productUnit: row.product.unit,
        type: row.type,
        quantity: row.quantity,
        previousStock: row.previousStock,
        newStock: row.newStock,
        reason: row.reason,
        forcedByAdmin: row.forcedByAdmin,
        unitSalePrice: row.unitSalePrice?.toNumber() ?? null,
        unitCostPrice: row.unitCostPrice?.toNumber() ?? null,
        saleId: row.saleId,
        purchaseId: row.purchaseId,
        actor: row.actor,
        createdAt: row.createdAt,
      })),
    };
  }

  async createManualAdjustment(
    dto: CreateAdjustmentDto,
    actor: {
      id: string;
      role: UserRole;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    if (dto.quantityDelta === 0) {
      throw new BadRequestException('La cantidad del ajuste no puede ser 0');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const nextStock = product.stockCurrent + dto.quantityDelta;
    const forceNegativeStock = Boolean(dto.forceNegativeStock);

    if (nextStock < 0 && !forceNegativeStock) {
      throw new BadRequestException('Stock insuficiente para ajuste negativo');
    }

    if (nextStock < 0 && actor.role !== UserRole.ADMIN) {
      throw new BadRequestException('Solo ADMIN puede forzar stock negativo');
    }

    const movementType =
      dto.quantityDelta > 0
        ? InventoryMovementType.MANUAL_ADJUSTMENT_POSITIVE
        : InventoryMovementType.MANUAL_ADJUSTMENT_NEGATIVE;

    const [updatedProduct, movement] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: product.id },
        data: { stockCurrent: nextStock, updatedByUserId: actor.id },
      }),
      this.prisma.inventoryMovement.create({
        data: {
          productId: product.id,
          type: movementType,
          quantity: dto.quantityDelta,
          previousStock: product.stockCurrent,
          newStock: nextStock,
          reason: dto.reason?.trim() || 'Ajuste manual de inventario',
          forcedByAdmin: nextStock < 0,
          actorUserId: actor.id,
        },
      }),
    ]);

    return {
      product: {
        id: updatedProduct.id,
        stockCurrent: updatedProduct.stockCurrent,
      },
      movement: {
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        previousStock: movement.previousStock,
        newStock: movement.newStock,
        forcedByAdmin: movement.forcedByAdmin,
        createdAt: movement.createdAt,
      },
    };
  }
}
