import { ProductCategory, ProductUnit, UserRole } from '@prisma/client';
import { PurchasesService } from './purchases.service';

function decimal(value: number) {
  return {
    toNumber: () => value,
  } as { toNumber: () => number };
}

describe('PurchasesService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const auditService = {
    log: jest.fn(),
  } as any;

  const service = new PurchasesService(prisma, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers purchase and increases product stock', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Refresco 355 ml',
        category: ProductCategory.BEBIDAS,
        unit: ProductUnit.LATA,
        stockCurrent: 10,
      },
    ]);

    const tx = {
      purchase: {
        create: jest.fn().mockResolvedValue({ id: 'c1', folio: 'C-20260319-10001' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          folio: 'C-20260319-10001',
          supplierName: 'Proveedor local',
          reference: null,
          notes: null,
          totalCost: decimal(120),
          createdByUserId: 'u1',
          createdByUser: {
            id: 'u1',
            name: 'Sofía',
            email: 'admin@magiccity.local',
            role: UserRole.ADMIN,
          },
          items: [
            {
              id: 'ci1',
              purchaseId: 'c1',
              productId: 'p1',
              productNameSnapshot: 'Refresco 355 ml',
              unitSnapshot: ProductUnit.LATA,
              quantity: 12,
              unitCostPrice: decimal(10),
              subtotal: decimal(120),
              createdAt: new Date('2026-03-19T13:00:00.000Z'),
            },
          ],
          createdAt: new Date('2026-03-19T13:00:00.000Z'),
          updatedAt: new Date('2026-03-19T13:00:00.000Z'),
        }),
      },
      purchaseItem: {
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

    const result = await service.createPurchase(
      {
        supplierName: 'Proveedor local',
        items: [{ productId: 'p1', quantity: 12, unitCostPrice: 10 }],
      },
      {
        id: 'u1',
        role: UserRole.ADMIN,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result.totalCost).toBe(120);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ stockCurrent: 22 }),
      }),
    );
  });
});
