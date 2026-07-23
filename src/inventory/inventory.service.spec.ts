import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const prisma = {
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const service = new InventoryService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
  });

  it('applies manual adjustment and records movement', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      stockCurrent: 5,
    });
    prisma.product.update.mockResolvedValue({ id: 'p1', stockCurrent: 8 });
    prisma.inventoryMovement.create.mockResolvedValue({
      id: 'm1',
      type: 'MANUAL_ADJUSTMENT_POSITIVE',
      quantity: 3,
      previousStock: 5,
      newStock: 8,
      forcedByAdmin: false,
      createdAt: new Date('2026-03-19T14:00:00.000Z'),
    });

    const result = await service.createManualAdjustment(
      {
        productId: 'p1',
        quantityDelta: 3,
        reason: 'Entrada manual',
      },
      {
        id: 'u-admin',
        role: 'ADMIN',
      },
    );

    expect(result.product.stockCurrent).toBe(8);
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 3,
          previousStock: 5,
          newStock: 8,
        }),
      }),
    );
  });

  it('rejects negative stock adjustment without force flag', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      stockCurrent: 2,
    });

    await expect(
      service.createManualAdjustment(
        {
          productId: 'p1',
          quantityDelta: -5,
          reason: 'Ajuste de salida',
        },
        {
          id: 'u-admin',
          role: 'ADMIN',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws not found when product does not exist', async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(
      service.createManualAdjustment(
        {
          productId: 'missing',
          quantityDelta: 1,
        },
        {
          id: 'u-admin',
          role: 'ADMIN',
        },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
