import { PaymentMethod, ProductCategory } from '@prisma/client';
import { FinanceService } from './finance.service';

const decimal = (value: number) => ({ toNumber: () => value });
const CINE_CATEGORY = 'CINE' as ProductCategory;

describe('FinanceService', () => {
  const prisma = {
    sale: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    purchase: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    saleItem: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
  } as any;

  const service = new FinanceService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sale.aggregate.mockResolvedValue({ _sum: { total: decimal(250) } });
    prisma.purchase.aggregate.mockResolvedValue({
      _sum: { totalCost: decimal(80) },
    });
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.purchase.findMany.mockResolvedValue([]);
    prisma.saleItem.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.saleItem.groupBy.mockImplementation(
      (args: { by: string[]; _sum: unknown }) => {
        if (args.by.includes('categorySnapshot')) {
          return Promise.resolve([
            {
              categorySnapshot: ProductCategory.BEBIDAS,
              _sum: { subtotal: decimal(120) },
            },
            {
              categorySnapshot: ProductCategory.BOTANAS,
              _sum: { subtotal: decimal(30) },
            },
            {
              categorySnapshot: CINE_CATEGORY,
              _sum: { subtotal: decimal(100) },
            },
          ]);
        }

        return Promise.resolve([]);
      },
    );
  });

  it('separates CINE income from operation income without changing legacy totals', async () => {
    const result = await service.getDashboard({});

    expect(result.totals.salesPeriod).toBe(250);
    expect(result.totals.operationSalesPeriod).toBe(150);
    expect(result.totals.cineSalesPeriod).toBe(100);
    expect(result.totals.combinedSalesPeriod).toBe(250);
    expect(result.financialAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'MAIN', total: 150 }),
        expect.objectContaining({ key: 'CINE', total: 100 }),
      ]),
    );
  });

  it('keeps payment method totals available for existing dashboard consumers', async () => {
    prisma.sale.aggregate.mockImplementation(
      ({ where }: { where?: { paymentMethod?: PaymentMethod } }) =>
        Promise.resolve({
          _sum: {
            total: decimal(where?.paymentMethod ? 10 : 250),
          },
        }),
    );

    const result = await service.getDashboard({});

    expect(result.paymentMethodTotals).toHaveLength(
      Object.values(PaymentMethod).length,
    );
    expect(result.paymentMethodTotals[0]).toEqual(
      expect.objectContaining({
        paymentMethod: expect.any(String),
        total: 10,
      }),
    );
  });
});
