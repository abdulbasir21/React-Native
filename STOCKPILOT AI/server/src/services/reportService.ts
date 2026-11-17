import { ensurePrismaConnected } from '../lib/prisma.js';
import { scopeWhere } from '../lib/shopScope.js';
import {
  customDateRangeBounds,
  derivePurchaseFinancials,
  deriveSaleFinancials,
  getLocalParts,
  periodBounds,
  type ReportPeriod,
} from '../shared/calculations.js';
import type { ExpenseCategory } from '../shared/enums.js';
import { dec, formatMoney, maxDecimal, round2, round3, round4, sumMoney } from '../shared/money.js';

export const SLOW_MOVING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportDateFilter {
  period?: ReportPeriod;
  from?: string;
  to?: string;
}

export interface ResolvedDateRange {
  timezone: string;
  period: ReportPeriod | 'custom';
  startUtc: Date;
  endUtc: Date;
  fromDate: string;
  toDate: string;
}

export async function resolveReportDateRange(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<ResolvedDateRange> {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: { timezone: true },
  });

  if (filter.from && filter.to) {
    const bounds = customDateRangeBounds(filter.from, filter.to, shop.timezone);
    return {
      timezone: shop.timezone,
      period: 'custom',
      startUtc: bounds.startUtc,
      endUtc: bounds.endUtc,
      fromDate: filter.from,
      toDate: filter.to,
    };
  }

  const period: ReportPeriod = filter.period ?? 'month';
  const bounds = periodBounds(period, shop.timezone, now);
  return {
    timezone: shop.timezone,
    period,
    startUtc: bounds.startUtc,
    endUtc: bounds.endUtc,
    fromDate: bounds.startLocalDate,
    toDate: bounds.endLocalDate,
  };
}

export interface SalesByDayPoint {
  date: string;
  revenue: string;
  salesCount: number;
}

export interface SalesReportResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  salesCount: number;
  cancelledCount: number;
  returnedValue: string;
  salesByDay: SalesByDayPoint[];
}

export async function getSalesReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<SalesReportResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);

  const sales = await prisma.sale.findMany({
    where: {
      ...scopeWhere(shopId),
      occurredAt: {
        gte: range.startUtc,
        lt: range.endUtc,
      },
    },
    include: {
      items: {
        select: { lineCogs: true },
      },
      returns: {
        include: {
          items: {
            select: { refundValue: true, cogsReversed: true },
          },
        },
      },
    },
    orderBy: { occurredAt: 'asc' },
  });

  let cancelledCount = 0;
  const revenues: string[] = [];
  const returnedValues: string[] = [];
  const cogsList: string[] = [];
  const byDayMap = new Map<string, { revenues: string[]; count: number }>();

  for (const sale of sales) {
    if (sale.status === 'CANCELLED') {
      cancelledCount += 1;
      continue;
    }

    const returnedVal = sumMoney(
      sale.returns.flatMap((r) => r.items.map((ri) => ri.refundValue.toString())),
    );
    const netRevenue = round2(dec(sale.total.toString()).minus(dec(returnedVal)));
    const grossCogs = sumMoney(sale.items.map((i) => i.lineCogs.toString()));
    const cogsReversed = sumMoney(
      sale.returns.flatMap((r) => r.items.map((ri) => ri.cogsReversed.toString())),
    );
    const netCogs = round2(dec(grossCogs).minus(dec(cogsReversed)));

    revenues.push(netRevenue);
    returnedValues.push(returnedVal);
    cogsList.push(netCogs);

    const dayKey = getLocalParts(sale.occurredAt, range.timezone).dateString;
    const existing = byDayMap.get(dayKey) ?? { revenues: [], count: 0 };
    existing.revenues.push(netRevenue);
    existing.count += 1;
    byDayMap.set(dayKey, existing);
  }

  const revenue = sumMoney(revenues);
  const cogs = sumMoney(cogsList);
  const grossProfit = round2(dec(revenue).minus(dec(cogs)));
  const returnedValue = sumMoney(returnedValues);

  const salesByDay: SalesByDayPoint[] = Array.from(byDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      revenue: sumMoney(bucket.revenues),
      salesCount: bucket.count,
    }));

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    revenue,
    cogs,
    grossProfit,
    salesCount: revenues.length,
    cancelledCount,
    returnedValue,
    salesByDay,
  };
}

export interface PurchasesReportResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalPurchases: string;
  purchaseCount: number;
  cashPaidToSuppliers: string;
}

export async function getPurchasesReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<PurchasesReportResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);

  const [purchases, supplierPayments] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        ...scopeWhere(shopId),
        occurredAt: {
          gte: range.startUtc,
          lt: range.endUtc,
        },
      },
      select: { total: true },
    }),
    prisma.payment.findMany({
      where: {
        ...scopeWhere(shopId),
        kind: 'PURCHASE_PAYMENT',
        paidAt: {
          gte: range.startUtc,
          lt: range.endUtc,
        },
      },
      select: { amount: true },
    }),
  ]);

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    totalPurchases: sumMoney(purchases.map((p) => p.total.toString())),
    purchaseCount: purchases.length,
    cashPaidToSuppliers: sumMoney(supplierPayments.map((p) => p.amount.toString())),
  };
}

export interface ExpenseCategoryBreakdown {
  category: ExpenseCategory;
  total: string;
  count: number;
}

export interface ExpenseReportResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalExpenses: string;
  expenseCount: number;
  byCategory: ExpenseCategoryBreakdown[];
}

export async function getExpenseReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<ExpenseReportResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);

  const expenses = await prisma.expense.findMany({
    where: {
      ...scopeWhere(shopId),
      expenseDate: {
        gte: range.startUtc,
        lt: range.endUtc,
      },
    },
    select: {
      category: true,
      amount: true,
    },
  });

  const catMap = new Map<ExpenseCategory, { amounts: string[]; count: number }>();
  for (const exp of expenses) {
    const cat = exp.category as ExpenseCategory;
    const entry = catMap.get(cat) ?? { amounts: [], count: 0 };
    entry.amounts.push(exp.amount.toString());
    entry.count += 1;
    catMap.set(cat, entry);
  }

  const byCategory: ExpenseCategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, bucket]) => ({
      category,
      total: sumMoney(bucket.amounts),
      count: bucket.count,
    }))
    .sort((a, b) => dec(b.total).cmp(dec(a.total)));

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    totalExpenses: sumMoney(expenses.map((e) => e.amount.toString())),
    expenseCount: expenses.length,
    byCategory,
  };
}

export interface WriteOffItem {
  movementId: string;
  productId: string;
  productName: string;
  type: 'DAMAGED' | 'EXPIRED';
  quantity: string;
  unitCost: string;
  value: string;
  reason: string | null;
  occurredAt: string;
}

export interface WriteOffsReportResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalWriteOffValue: string;
  count: number;
  items: WriteOffItem[];
}

export async function getWriteOffsReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<WriteOffsReportResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...scopeWhere(shopId),
      type: { in: ['DAMAGED', 'EXPIRED'] },
      occurredAt: {
        gte: range.startUtc,
        lt: range.endUtc,
      },
    },
    include: {
      product: {
        select: { name: true, averageCost: true },
      },
    },
    orderBy: { occurredAt: 'desc' },
  });

  const items: WriteOffItem[] = movements.map((m) => {
    const qty = round3(dec(m.quantityChange.toString()).abs());
    const unitCost = round4(m.product.averageCost.toString());
    const value = round2(dec(qty).times(dec(unitCost)));
    return {
      movementId: m.id,
      productId: m.productId,
      productName: m.product.name,
      type: m.type as 'DAMAGED' | 'EXPIRED',
      quantity: qty,
      unitCost,
      value,
      reason: m.reason,
      occurredAt: m.occurredAt.toISOString(),
    };
  });

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    totalWriteOffValue: sumMoney(items.map((i) => i.value)),
    count: items.length,
    items,
  };
}

export interface ProfitReportResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  operatingExpenses: string;
  netOperatingProfit: string;
  cashReceived: string;
  cashPaidToSuppliers: string;
  writeOffs: string;
}

export async function getProfitReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<ProfitReportResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);

  const [salesReport, expenseReport, writeOffsReport, payments] = await Promise.all([
    getSalesReport(shopId, filter, now),
    getExpenseReport(shopId, filter, now),
    getWriteOffsReport(shopId, filter, now),
    prisma.payment.findMany({
      where: {
        ...scopeWhere(shopId),
        paidAt: {
          gte: range.startUtc,
          lt: range.endUtc,
        },
      },
      select: { kind: true, amount: true },
    }),
  ]);

  const saleIn = sumMoney(
    payments.filter((p) => p.kind === 'SALE_PAYMENT').map((p) => p.amount.toString()),
  );
  const saleRefund = sumMoney(
    payments.filter((p) => p.kind === 'SALE_REFUND').map((p) => p.amount.toString()),
  );
  const cashReceived = round2(dec(saleIn).minus(dec(saleRefund)));
  const cashPaidToSuppliers = sumMoney(
    payments.filter((p) => p.kind === 'PURCHASE_PAYMENT').map((p) => p.amount.toString()),
  );

  const netOperatingProfit = round2(
    dec(salesReport.grossProfit).minus(dec(expenseReport.totalExpenses)),
  );

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    revenue: salesReport.revenue,
    cogs: salesReport.cogs,
    grossProfit: salesReport.grossProfit,
    operatingExpenses: expenseReport.totalExpenses,
    netOperatingProfit,
    cashReceived,
    cashPaidToSuppliers,
    writeOffs: writeOffsReport.totalWriteOffValue,
  };
}

export interface InventoryValuationItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantityOnHand: string;
  averageCost: string;
  valuation: string;
  archived: boolean;
}

export interface InventoryValuationResult {
  totalValue: string;
  activeProductCount: number;
  totalProductCount: number;
  lowStockCount: number;
  negativeStockCount: number;
  items: InventoryValuationItem[];
}

export async function getInventoryValuationReport(
  shopId: string,
): Promise<InventoryValuationResult> {
  const prisma = await ensurePrismaConnected();
  const products = await prisma.product.findMany({
    where: scopeWhere(shopId),
    orderBy: { name: 'asc' },
  });

  let totalExact = dec(0);
  let activeProductCount = 0;
  let lowStockCount = 0;
  let negativeStockCount = 0;

  const items: InventoryValuationItem[] = products.map((p) => {
    const qty = dec(p.quantityOnHand.toString());
    const minLevel = dec(p.minStockLevel.toString());
    const avgCost = dec(p.averageCost.toString());
    const nonNegativeQty = maxDecimal(qty, 0);
    const exactLine = nonNegativeQty.times(avgCost);
    totalExact = totalExact.plus(exactLine);

    const archived = p.archivedAt !== null;
    if (!archived) {
      activeProductCount += 1;
      if (qty.lte(minLevel)) {
        lowStockCount += 1;
      }
    }
    if (qty.lt(0)) {
      negativeStockCount += 1;
    }

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      quantityOnHand: round3(qty),
      averageCost: round4(avgCost),
      valuation: round2(exactLine),
      archived,
    };
  });

  return {
    totalValue: round2(totalExact),
    activeProductCount,
    totalProductCount: products.length,
    lowStockCount,
    negativeStockCount,
    items,
  };
}

export interface BestSellingProduct {
  productId: string;
  name: string;
  unit: string;
  netQuantitySold: string;
  netRevenue: string;
}

export interface SlowMovingProduct {
  productId: string;
  name: string;
  unit: string;
  quantityOnHand: string;
  lastSoldAt: string | null;
  createdAt: string;
}

export interface LowStockProduct {
  productId: string;
  name: string;
  unit: string;
  quantityOnHand: string;
  minStockLevel: string;
}

export interface ProductPerformanceResult {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  bestSelling: BestSellingProduct[];
  slowMoving: SlowMovingProduct[];
  lowStock: LowStockProduct[];
}

export async function getProductPerformanceReport(
  shopId: string,
  filter: ReportDateFilter = {},
  now: Date = new Date(),
): Promise<ProductPerformanceResult> {
  const prisma = await ensurePrismaConnected();
  const range = await resolveReportDateRange(shopId, filter, now);
  const cutoff = new Date(now.getTime() - SLOW_MOVING_DAYS * DAY_MS);

  const [periodSales, allActiveProducts, recentCompletedSaleItems] = await Promise.all([
    prisma.sale.findMany({
      where: {
        ...scopeWhere(shopId),
        status: 'COMPLETED',
        occurredAt: {
          gte: range.startUtc,
          lt: range.endUtc,
        },
      },
      include: {
        items: {
          include: {
            returnItems: {
              select: { quantity: true, refundValue: true },
            },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        ...scopeWhere(shopId),
        archivedAt: null,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: {
          ...scopeWhere(shopId),
          status: 'COMPLETED',
        },
      },
      select: {
        productId: true,
        sale: {
          select: { occurredAt: true },
        },
      },
    }),
  ]);

  const bestMap = new Map<
    string,
    { name: string; unit: string; qty: ReturnType<typeof dec>; rev: ReturnType<typeof dec> }
  >();

  for (const sale of periodSales) {
    for (const item of sale.items) {
      const returnedQty = item.returnItems.reduce(
        (acc, ri) => acc.plus(dec(ri.quantity.toString())),
        dec(0),
      );
      const refundedVal = item.returnItems.reduce(
        (acc, ri) => acc.plus(dec(ri.refundValue.toString())),
        dec(0),
      );
      const netQty = dec(item.quantity.toString()).minus(returnedQty);
      const netRev = dec(item.lineNet.toString()).minus(refundedVal);

      const existing = bestMap.get(item.productId) ?? {
        name: item.productNameSnapshot,
        unit: item.unitSnapshot,
        qty: dec(0),
        rev: dec(0),
      };
      existing.qty = existing.qty.plus(netQty);
      existing.rev = existing.rev.plus(netRev);
      bestMap.set(item.productId, existing);
    }
  }

  const bestSelling: BestSellingProduct[] = Array.from(bestMap.entries())
    .filter(([, v]) => v.qty.gt(0))
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      unit: v.unit,
      netQuantitySold: round3(v.qty),
      netRevenue: round2(v.rev),
    }))
    .sort((a, b) => {
      const qCmp = dec(b.netQuantitySold).cmp(dec(a.netQuantitySold));
      if (qCmp !== 0) return qCmp;
      return dec(b.netRevenue).cmp(dec(a.netRevenue));
    });

  const lastSoldMap = new Map<string, Date>();
  for (const si of recentCompletedSaleItems) {
    const prev = lastSoldMap.get(si.productId);
    if (!prev || si.sale.occurredAt > prev) {
      lastSoldMap.set(si.productId, si.sale.occurredAt);
    }
  }

  const slowMoving: SlowMovingProduct[] = [];
  const lowStock: LowStockProduct[] = [];

  for (const product of allActiveProducts) {
    const qty = dec(product.quantityOnHand.toString());
    const minLevel = dec(product.minStockLevel.toString());

    if (qty.lte(minLevel)) {
      lowStock.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantityOnHand: round3(qty),
        minStockLevel: round3(minLevel),
      });
    }

    if (qty.gt(0)) {
      const lastSold = lastSoldMap.get(product.id) ?? null;
      const isSlow = lastSold ? lastSold < cutoff : product.createdAt < cutoff;
      if (isSlow) {
        slowMoving.push({
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantityOnHand: round3(qty),
          lastSoldAt: lastSold ? lastSold.toISOString() : null,
          createdAt: product.createdAt.toISOString(),
        });
      }
    }
  }

  return {
    period: range.period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    timezone: range.timezone,
    bestSelling,
    slowMoving,
    lowStock,
  };
}

export interface CustomerBalanceRow {
  customerId: string;
  name: string;
  phone: string | null;
  balance: string;
  archived: boolean;
}

export interface SupplierBalanceRow {
  supplierId: string;
  name: string;
  phone: string | null;
  balance: string;
  archived: boolean;
}

export interface BalancesReportResult {
  totalCustomerOutstanding: string;
  totalSupplierPayable: string;
  customers: CustomerBalanceRow[];
  suppliers: SupplierBalanceRow[];
}

export async function getBalancesReport(shopId: string): Promise<BalancesReportResult> {
  const prisma = await ensurePrismaConnected();

  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({
      where: scopeWhere(shopId),
      include: {
        sales: {
          where: { status: 'COMPLETED' },
          include: {
            payments: { select: { kind: true, amount: true } },
            returns: {
              include: { items: { select: { refundValue: true } } },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: scopeWhere(shopId),
      include: {
        purchases: {
          include: {
            payments: { select: { amount: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const customerRows: CustomerBalanceRow[] = customers.map((c) => {
    const balance = sumMoney(
      c.sales.map((sale) => {
        const returnedVal = sumMoney(
          sale.returns.flatMap((r) => r.items.map((ri) => ri.refundValue.toString())),
        );
        const fin = deriveSaleFinancials({
          total: sale.total.toString(),
          returnedValue: returnedVal,
          status: 'COMPLETED',
          payments: sale.payments.map((p) => ({
            kind: p.kind as 'SALE_PAYMENT' | 'SALE_REFUND',
            amount: p.amount.toString(),
          })),
        });
        return fin.balanceDue;
      }),
    );
    return {
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      balance,
      archived: c.archivedAt !== null,
    };
  });

  const supplierRows: SupplierBalanceRow[] = suppliers.map((s) => {
    const balance = sumMoney(
      s.purchases.map((purchase) => {
        const fin = derivePurchaseFinancials({
          total: purchase.total.toString(),
          payments: purchase.payments.map((p) => ({ amount: p.amount.toString() })),
        });
        return fin.balanceDue;
      }),
    );
    return {
      supplierId: s.id,
      name: s.name,
      phone: s.phone,
      balance,
      archived: s.archivedAt !== null,
    };
  });

  return {
    totalCustomerOutstanding: sumMoney(customerRows.map((r) => r.balance)),
    totalSupplierPayable: sumMoney(supplierRows.map((r) => r.balance)),
    customers: customerRows,
    suppliers: supplierRows,
  };
}

export interface DashboardRecentSale {
  id: string;
  receiptNo: string;
  customerName: string | null;
  total: string;
  netTotal: string;
  status: string;
  paymentStatus: string;
  occurredAt: string;
}

export interface DashboardRecentPurchase {
  id: string;
  supplierName: string;
  total: string;
  paymentStatus: string;
  occurredAt: string;
}

export interface DashboardSummaryResult {
  period: ReportPeriod;
  fromDate: string;
  toDate: string;
  timezone: string;
  sales: string;
  salesCount: number;
  expenses: string;
  estimatedProfit: string;
  cashReceived: string;
  cashPaidToSuppliers: string;
  cogs: string;
  grossProfit: string;
  writeOffs: string;
  productCount: number;
  lowStockCount: number;
  inventoryValue: string;
  customerOutstanding: string;
  supplierPayable: string;
  recentSales: DashboardRecentSale[];
  recentPurchases: DashboardRecentPurchase[];
  salesChart: SalesByDayPoint[];
}

export async function getDashboardSummary(
  shopId: string,
  period: ReportPeriod = 'today',
  now: Date = new Date(),
): Promise<DashboardSummaryResult> {
  const prisma = await ensurePrismaConnected();

  const [
    salesReport,
    profitReport,
    inventoryReport,
    balancesReport,
    recentSalesRaw,
    recentPurchasesRaw,
  ] = await Promise.all([
    getSalesReport(shopId, { period }, now),
    getProfitReport(shopId, { period }, now),
    getInventoryValuationReport(shopId),
    getBalancesReport(shopId),
    prisma.sale.findMany({
      where: scopeWhere(shopId),
      orderBy: { occurredAt: 'desc' },
      take: 5,
      include: {
        customer: { select: { name: true } },
        payments: { select: { kind: true, amount: true } },
        returns: {
          include: { items: { select: { refundValue: true } } },
        },
      },
    }),
    prisma.purchase.findMany({
      where: scopeWhere(shopId),
      orderBy: { occurredAt: 'desc' },
      take: 5,
      include: {
        supplier: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
  ]);

  const recentSales: DashboardRecentSale[] = recentSalesRaw.map((sale) => {
    const returnedVal = sumMoney(
      sale.returns.flatMap((r) => r.items.map((ri) => ri.refundValue.toString())),
    );
    const fin = deriveSaleFinancials({
      total: sale.total.toString(),
      returnedValue: returnedVal,
      status: sale.status as 'COMPLETED' | 'CANCELLED',
      payments: sale.payments.map((p) => ({
        kind: p.kind as 'SALE_PAYMENT' | 'SALE_REFUND',
        amount: p.amount.toString(),
      })),
    });
    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      customerName: sale.customer?.name ?? null,
      total: formatMoney(sale.total.toString()),
      netTotal: fin.netTotal,
      status: sale.status,
      paymentStatus: sale.status === 'CANCELLED' ? 'NOT_APPLICABLE' : fin.paymentStatus,
      occurredAt: sale.occurredAt.toISOString(),
    };
  });

  const recentPurchases: DashboardRecentPurchase[] = recentPurchasesRaw.map((p) => {
    const fin = derivePurchaseFinancials({
      total: p.total.toString(),
      payments: p.payments.map((pay) => ({ amount: pay.amount.toString() })),
    });
    return {
      id: p.id,
      supplierName: p.supplier.name,
      total: formatMoney(p.total.toString()),
      paymentStatus: fin.paymentStatus,
      occurredAt: p.occurredAt.toISOString(),
    };
  });

  return {
    period,
    fromDate: salesReport.fromDate,
    toDate: salesReport.toDate,
    timezone: salesReport.timezone,
    sales: salesReport.revenue,
    salesCount: salesReport.salesCount,
    expenses: profitReport.operatingExpenses,
    estimatedProfit: profitReport.netOperatingProfit,
    cashReceived: profitReport.cashReceived,
    cashPaidToSuppliers: profitReport.cashPaidToSuppliers,
    cogs: profitReport.cogs,
    grossProfit: profitReport.grossProfit,
    writeOffs: profitReport.writeOffs,
    productCount: inventoryReport.activeProductCount,
    lowStockCount: inventoryReport.lowStockCount,
    inventoryValue: inventoryReport.totalValue,
    customerOutstanding: balancesReport.totalCustomerOutstanding,
    supplierPayable: balancesReport.totalSupplierPayable,
    recentSales,
    recentPurchases,
    salesChart: salesReport.salesByDay,
  };
}
