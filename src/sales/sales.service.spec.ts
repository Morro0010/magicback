import { BadRequestException } from '@nestjs/common';
import {
  PaymentMethod,
  ProductCategory,
  ProductUnit,
  UserRole,
} from '@prisma/client';
import { SalesService } from './sales.service';

function decimal(value: number) {
  return {
    toNumber: () => value,
  } as { toNumber: () => number };
}

describe('SalesService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
    },
    sale: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const notificationsService = {
    createNotification: jest.fn(),
  } as any;

  const auditService = {
    log: jest.fn(),
  } as any;

  const service = new SalesService(prisma, notificationsService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a sale and decreases stock', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Papitas clásicas',
        sku: 'BOT-001',
        category: ProductCategory.BOTANAS,
        unit: ProductUnit.BOLSA,
        salePrice: decimal(25),
        costPrice: decimal(12),
        stockCurrent: 10,
        stockMin: 2,
        isActive: true,
      },
    ]);

    const tx = {
      sale: {
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 's1',
          folio: 'V-20260319-10001',
          paymentMethod: PaymentMethod.CASH,
          subtotal: decimal(50),
          total: decimal(50),
          forcedByAdmin: false,
          customerPhone: null,
          notes: null,
          createdByUserId: 'u1',
          createdByUser: {
            id: 'u1',
            name: 'Caja Uno',
            email: 'caja@magiccity.local',
            role: UserRole.CASHIER,
          },
          items: [
            {
              id: 'si1',
              saleId: 's1',
              productId: 'p1',
              productNameSnapshot: 'Papitas clásicas',
              skuSnapshot: 'BOT-001',
              categorySnapshot: ProductCategory.BOTANAS,
              unitSnapshot: ProductUnit.BOLSA,
              quantity: 2,
              unitSalePrice: decimal(25),
              unitCostPrice: decimal(12),
              subtotal: decimal(50),
              forcedNegativeStock: false,
              createdAt: new Date('2026-03-19T12:00:00.000Z'),
            },
          ],
          createdAt: new Date('2026-03-19T12:00:00.000Z'),
          updatedAt: new Date('2026-03-19T12:00:00.000Z'),
        }),
      },
      saleItem: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      product: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prisma.$transaction.mockImplementation(async (fn: (txArg: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await service.createSale(
      {
        items: [{ productId: 'p1', quantity: 2 }],
        paymentMethod: PaymentMethod.CASH,
      },
      {
        id: 'u1',
        role: UserRole.CASHIER,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result.total).toBe(50);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ stockCurrent: 8 }),
      }),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'POS_SALE_CREATED',
      }),
    );
  });

  it('blocks cashier when there is not enough stock', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Chocolate',
        sku: 'DUL-001',
        category: ProductCategory.DULCES,
        unit: ProductUnit.PIEZA,
        salePrice: decimal(15),
        costPrice: decimal(8),
        stockCurrent: 1,
        stockMin: 1,
        isActive: true,
      },
    ]);

    await expect(
      service.createSale(
        {
          items: [{ productId: 'p1', quantity: 3 }],
          paymentMethod: PaymentMethod.CASH,
        },
        {
          id: 'u2',
          role: UserRole.CASHIER,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows forced sale with insufficient stock for ADMIN', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p2',
        name: 'Chocolate',
        sku: 'DUL-001',
        category: ProductCategory.DULCES,
        unit: ProductUnit.PIEZA,
        salePrice: decimal(15),
        costPrice: decimal(8),
        stockCurrent: 0,
        stockMin: 1,
        isActive: true,
      },
    ]);

    const tx = {
      sale: {
        create: jest.fn().mockResolvedValue({ id: 's2' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 's2',
          folio: 'V-20260319-10002',
          paymentMethod: PaymentMethod.TRANSFER,
          subtotal: decimal(30),
          total: decimal(30),
          forcedByAdmin: true,
          customerPhone: null,
          notes: null,
          createdByUserId: 'u-admin',
          createdByUser: {
            id: 'u-admin',
            name: 'Sofía',
            email: 'admin@magiccity.local',
            role: UserRole.ADMIN,
          },
          items: [
            {
              id: 'si2',
              saleId: 's2',
              productId: 'p2',
              productNameSnapshot: 'Chocolate',
              skuSnapshot: 'DUL-001',
              categorySnapshot: ProductCategory.DULCES,
              unitSnapshot: ProductUnit.PIEZA,
              quantity: 2,
              unitSalePrice: decimal(15),
              unitCostPrice: decimal(8),
              subtotal: decimal(30),
              forcedNegativeStock: true,
              createdAt: new Date('2026-03-19T12:00:00.000Z'),
            },
          ],
          createdAt: new Date('2026-03-19T12:00:00.000Z'),
          updatedAt: new Date('2026-03-19T12:00:00.000Z'),
        }),
      },
      saleItem: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      product: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prisma.$transaction.mockImplementation(async (fn: (txArg: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await service.createSale(
      {
        items: [{ productId: 'p2', quantity: 2 }],
        paymentMethod: PaymentMethod.TRANSFER,
        forceNegativeStock: true,
      },
      {
        id: 'u-admin',
        role: UserRole.ADMIN,
      },
    );

    expect(result.forcedByAdmin).toBe(true);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADMIN_FORCED_SALE' }),
      }),
    );
  });
});
