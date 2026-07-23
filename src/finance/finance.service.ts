import { Injectable, Optional } from '@nestjs/common';
import { PaymentMethod, Prisma, ProductCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialEventsService } from '../special-events/special-events.service';
import { FinanceRangeQueryDto } from './dto/finance-range-query.dto';

type DateRange = { from?: Date; to?: Date };
const CINE_CATEGORY = 'CINE' as ProductCategory;

const SEPARATE_FINANCIAL_ACCOUNTS = [
  {
    key: 'CINE',
    label: 'Ingresos CINE',
    categories: [CINE_CATEGORY],
  },
] as const;

type FinancialAccountKey =
  | 'MAIN'
  | (typeof SEPARATE_FINANCIAL_ACCOUNTS)[number]['key'];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly specialEventsService?: SpecialEventsService,
  ) {}

  async getDashboard(query: FinanceRangeQueryDto) {
    const periodRange = this.resolveRange(query);
    const todayRange = this.resolveTodayRange();

    const [
      salesToday,
      salesPeriod,
      purchasesToday,
      purchasesPeriod,
      paymentMethodPeriod,
      topProductsPeriod,
      lowStockProducts,
      products,
      salesHistory,
      purchasesHistory,
      grossToday,
      grossPeriod,
      financialToday,
      financialPeriod,
      specialEventsPeriod,
    ] = await Promise.all([
      this.sumSales(todayRange),
      this.sumSales(periodRange),
      this.sumPurchases(todayRange),
      this.sumPurchases(periodRange),
      this.salesByPaymentMethod(periodRange),
      this.topSoldProducts(periodRange),
      this.lowStockProducts(),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { costPrice: true, stockCurrent: true },
      }),
      this.prisma.sale.findMany({
        where: this.whereByDateRange(periodRange),
        include: {
          createdByUser: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.purchase.findMany({
        where: this.wherePurchaseByDateRange(periodRange),
        include: {
          createdByUser: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.grossProfit(todayRange),
      this.grossProfit(periodRange),
      this.salesByFinancialAccount(todayRange),
      this.salesByFinancialAccount(periodRange),
      this.specialEventsService?.getFinanceSummary(periodRange) ??
        Promise.resolve({
          expectedSpecialEventIncomePeriod: 0,
          confirmedSpecialEventIncomePeriod: 0,
          pendingSpecialEventIncomePeriod: 0,
          reservationCounts: {
            pendingPayment: 0,
            paymentConfirmed: 0,
            cancelled: 0,
          },
        }),
    ]);

    const inventoryValuation = Number(
      products
        .reduce(
          (acc, product) =>
            acc + product.costPrice.toNumber() * product.stockCurrent,
          0,
        )
        .toFixed(2),
    );

    return {
      totals: {
        salesToday,
        salesPeriod,
        operationSalesToday: financialToday.operationSales,
        operationSalesPeriod: financialPeriod.operationSales,
        cineSalesToday: financialToday.byKey.CINE?.total ?? 0,
        cineSalesPeriod: financialPeriod.byKey.CINE?.total ?? 0,
        combinedSalesToday: financialToday.combinedSales,
        combinedSalesPeriod: financialPeriod.combinedSales,
        purchasesToday,
        purchasesPeriod,
        grossProfitToday: grossToday,
        grossProfitPeriod: grossPeriod,
      },
      financialAccounts: financialPeriod.accounts,
      specialEvents: specialEventsPeriod,
      paymentMethodTotals: paymentMethodPeriod,
      topProducts: topProductsPeriod,
      lowStockProducts,
      inventoryValuation,
      salesHistory: salesHistory.map((sale) => ({
        id: sale.id,
        folio: sale.folio,
        total: sale.total.toNumber(),
        subtotal: sale.subtotal.toNumber(),
        paymentMethod: sale.paymentMethod,
        forcedByAdmin: sale.forcedByAdmin,
        createdByUser: sale.createdByUser,
        createdAt: sale.createdAt,
      })),
      purchasesHistory: purchasesHistory.map((purchase) => ({
        id: purchase.id,
        folio: purchase.folio,
        supplierName: purchase.supplierName,
        totalCost: purchase.totalCost.toNumber(),
        createdByUser: purchase.createdByUser,
        createdAt: purchase.createdAt,
      })),
      range: {
        from: periodRange.from ?? null,
        to: periodRange.to ?? null,
      },
    };
  }

  async getSalesHistory(query: FinanceRangeQueryDto) {
    const range = this.resolveRange(query);
    const rows = await this.prisma.sale.findMany({
      where: this.whereByDateRange(range),
      include: {
        createdByUser: {
          select: { id: true, name: true, role: true },
        },
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });

    return {
      items: rows.map((sale) => ({
        id: sale.id,
        folio: sale.folio,
        subtotal: sale.subtotal.toNumber(),
        total: sale.total.toNumber(),
        paymentMethod: sale.paymentMethod,
        forcedByAdmin: sale.forcedByAdmin,
        createdByUser: sale.createdByUser,
        createdAt: sale.createdAt,
        items: sale.items.map((item) => ({
          id: item.id,
          productName: item.productNameSnapshot,
          quantity: item.quantity,
          unit: item.unitSnapshot,
          unitSalePrice: item.unitSalePrice.toNumber(),
          unitCostPrice: item.unitCostPrice.toNumber(),
          subtotal: item.subtotal.toNumber(),
          forcedNegativeStock: item.forcedNegativeStock,
        })),
      })),
    };
  }

  async getPurchasesHistory(query: FinanceRangeQueryDto) {
    const range = this.resolveRange(query);
    const rows = await this.prisma.purchase.findMany({
      where: this.wherePurchaseByDateRange(range),
      include: {
        createdByUser: {
          select: { id: true, name: true, role: true },
        },
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });

    return {
      items: rows.map((purchase) => ({
        id: purchase.id,
        folio: purchase.folio,
        supplierName: purchase.supplierName,
        reference: purchase.reference,
        totalCost: purchase.totalCost.toNumber(),
        createdByUser: purchase.createdByUser,
        createdAt: purchase.createdAt,
        items: purchase.items.map((item) => ({
          id: item.id,
          productName: item.productNameSnapshot,
          quantity: item.quantity,
          unit: item.unitSnapshot,
          unitCostPrice: item.unitCostPrice.toNumber(),
          subtotal: item.subtotal.toNumber(),
        })),
      })),
    };
  }

  private resolveTodayRange(): DateRange {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { from: start, to: end };
  }

  private resolveRange(query: FinanceRangeQueryDto): DateRange {
    return {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
  }

  private whereByDateRange(range: DateRange): Prisma.SaleWhereInput {
    return {
      createdAt:
        range.from || range.to
          ? {
              gte: range.from,
              lte: range.to,
            }
          : undefined,
    };
  }

  private wherePurchaseByDateRange(
    range: DateRange,
  ): Prisma.PurchaseWhereInput {
    return {
      createdAt:
        range.from || range.to
          ? {
              gte: range.from,
              lte: range.to,
            }
          : undefined,
    };
  }

  private async sumSales(range: DateRange) {
    const agg = await this.prisma.sale.aggregate({
      where: this.whereByDateRange(range),
      _sum: { total: true },
    });

    return agg._sum.total?.toNumber() ?? 0;
  }

  private async salesByFinancialAccount(range: DateRange) {
    const separatedCategories = new Set<ProductCategory>(
      SEPARATE_FINANCIAL_ACCOUNTS.flatMap((account) => account.categories),
    );

    const grouped = await this.prisma.saleItem.groupBy({
      by: ['categorySnapshot'],
      where: {
        sale: this.whereByDateRange(range),
      },
      _sum: {
        subtotal: true,
      },
    });

    const totalsByCategory = new Map(
      grouped.map((row) => [
        row.categorySnapshot,
        row._sum.subtotal?.toNumber() ?? 0,
      ]),
    );

    const operationSales = Number(
      Object.values(ProductCategory)
        .filter((category) => !separatedCategories.has(category))
        .reduce(
          (acc, category) => acc + (totalsByCategory.get(category) ?? 0),
          0,
        )
        .toFixed(2),
    );

    const accounts = [
      {
        key: 'MAIN' as const,
        label: 'Ingresos operación principal',
        categories: Object.values(ProductCategory).filter(
          (category) => !separatedCategories.has(category),
        ),
        total: operationSales,
      },
      ...SEPARATE_FINANCIAL_ACCOUNTS.map((account) => ({
        key: account.key,
        label: account.label,
        categories: [...account.categories],
        total: Number(
          account.categories
            .reduce(
              (acc, category) => acc + (totalsByCategory.get(category) ?? 0),
              0,
            )
            .toFixed(2),
        ),
      })),
    ];

    const byKey = accounts.reduce<
      Record<FinancialAccountKey, (typeof accounts)[number]>
    >(
      (acc, account) => {
        acc[account.key] = account;
        return acc;
      },
      {} as Record<FinancialAccountKey, (typeof accounts)[number]>,
    );

    const combinedSales = Number(
      accounts.reduce((acc, account) => acc + account.total, 0).toFixed(2),
    );

    return {
      accounts,
      byKey,
      operationSales,
      combinedSales,
    };
  }

  private async sumPurchases(range: DateRange) {
    const agg = await this.prisma.purchase.aggregate({
      where: this.wherePurchaseByDateRange(range),
      _sum: { totalCost: true },
    });

    return agg._sum.totalCost?.toNumber() ?? 0;
  }

  private async grossProfit(range: DateRange) {
    const rows = await this.prisma.saleItem.findMany({
      where: {
        sale: this.whereByDateRange(range),
      },
      select: {
        quantity: true,
        unitSalePrice: true,
        unitCostPrice: true,
      },
    });

    return Number(
      rows
        .reduce((acc, row) => {
          const sale = row.unitSalePrice.toNumber();
          const cost = row.unitCostPrice.toNumber();
          return acc + (sale - cost) * row.quantity;
        }, 0)
        .toFixed(2),
    );
  }

  private async salesByPaymentMethod(range: DateRange) {
    const methods = Object.values(PaymentMethod);
    const values = await Promise.all(
      methods.map(async (method) => {
        const agg = await this.prisma.sale.aggregate({
          where: {
            ...this.whereByDateRange(range),
            paymentMethod: method,
          },
          _sum: { total: true },
        });

        return {
          paymentMethod: method,
          total: agg._sum.total?.toNumber() ?? 0,
        };
      }),
    );

    return values;
  }

  private async topSoldProducts(range: DateRange) {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId', 'productNameSnapshot'],
      where: {
        sale: this.whereByDateRange(range),
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 10,
    });

    return grouped.map((row) => ({
      productId: row.productId,
      productName: row.productNameSnapshot,
      quantity: row._sum.quantity ?? 0,
      subtotal: row._sum.subtotal?.toNumber() ?? 0,
    }));
  }

  private async lowStockProducts() {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        stockMin: { not: null },
      },
      orderBy: [{ stockCurrent: 'asc' }, { name: 'asc' }],
      take: 100,
    });

    return products
      .filter(
        (product) =>
          product.stockMin !== null && product.stockCurrent <= product.stockMin,
      )
      .map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        stockCurrent: product.stockCurrent,
        stockMin: product.stockMin,
      }));
  }
}
