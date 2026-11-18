import { apiClient } from '../api/client';
import type { ExpenseCategory } from '../shared/enums';

export type ReportPeriod = 'today' | 'week' | 'month';

export interface ReportDateFilter {
  period?: ReportPeriod;
  from?: string;
  to?: string;
}

export interface SalesByDayPointDTO {
  date: string;
  revenue: string;
  salesCount: number;
}

export interface DashboardRecentSaleDTO {
  id: string;
  receiptNo: string;
  customerName: string | null;
  total: string;
  netTotal: string;
  status: string;
  paymentStatus: string;
  occurredAt: string;
}

export interface DashboardRecentPurchaseDTO {
  id: string;
  supplierName: string;
  total: string;
  paymentStatus: string;
  occurredAt: string;
}

export interface DashboardSummaryDTO {
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
  recentSales: DashboardRecentSaleDTO[];
  recentPurchases: DashboardRecentPurchaseDTO[];
  salesChart: SalesByDayPointDTO[];
}

export interface SalesReportDTO {
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
  salesByDay: SalesByDayPointDTO[];
}

export interface PurchasesReportDTO {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalPurchases: string;
  purchaseCount: number;
  cashPaidToSuppliers: string;
}

export interface ExpenseReportDTO {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalExpenses: string;
  expenseCount: number;
  byCategory: Array<{ category: ExpenseCategory; total: string; count: number }>;
}

export interface ProfitReportDTO {
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

export interface InventoryValuationDTO {
  totalValue: string;
  activeProductCount: number;
  totalProductCount: number;
  lowStockCount: number;
  negativeStockCount: number;
  items: Array<{
    productId: string;
    name: string;
    sku: string | null;
    unit: string;
    quantityOnHand: string;
    averageCost: string;
    valuation: string;
    archived: boolean;
  }>;
}

export interface ProductPerformanceDTO {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  bestSelling: Array<{
    productId: string;
    name: string;
    unit: string;
    netQuantitySold: string;
    netRevenue: string;
  }>;
  slowMoving: Array<{
    productId: string;
    name: string;
    unit: string;
    quantityOnHand: string;
    lastSoldAt: string | null;
    createdAt: string;
  }>;
  lowStock: Array<{
    productId: string;
    name: string;
    unit: string;
    quantityOnHand: string;
    minStockLevel: string;
  }>;
}

export interface BalancesReportDTO {
  totalCustomerOutstanding: string;
  totalSupplierPayable: string;
  customers: Array<{
    customerId: string;
    name: string;
    phone: string | null;
    balance: string;
    archived: boolean;
  }>;
  suppliers: Array<{
    supplierId: string;
    name: string;
    phone: string | null;
    balance: string;
    archived: boolean;
  }>;
}

export interface WriteOffsReportDTO {
  period: ReportPeriod | 'custom';
  fromDate: string;
  toDate: string;
  timezone: string;
  totalWriteOffValue: string;
  count: number;
  items: Array<{
    movementId: string;
    productId: string;
    productName: string;
    type: 'DAMAGED' | 'EXPIRED';
    quantity: string;
    unitCost: string;
    value: string;
    reason: string | null;
    occurredAt: string;
  }>;
}

function buildFilterQuery(filter: ReportDateFilter = {}): string {
  const qs = new URLSearchParams();
  if (filter.from && filter.to) {
    qs.set('from', filter.from);
    qs.set('to', filter.to);
  } else if (filter.period) {
    qs.set('period', filter.period);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export function validateCustomDateRange(from: string, to: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) {
    return 'Dates must be in YYYY-MM-DD format';
  }
  if (from > to) {
    return 'From date must be on or before To date';
  }
  return null;
}

export const reportRepository = {
  async getDashboard(period: ReportPeriod = 'today'): Promise<DashboardSummaryDTO> {
    const res = await apiClient.get<{ data: DashboardSummaryDTO }>(
      `/dashboard?period=${period}`,
    );
    return res.data.data;
  },

  async getSalesReport(filter: ReportDateFilter = {}): Promise<SalesReportDTO> {
    const res = await apiClient.get<{ data: SalesReportDTO }>(
      `/reports/sales${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },

  async getPurchasesReport(filter: ReportDateFilter = {}): Promise<PurchasesReportDTO> {
    const res = await apiClient.get<{ data: PurchasesReportDTO }>(
      `/reports/purchases${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },

  async getExpenseReport(filter: ReportDateFilter = {}): Promise<ExpenseReportDTO> {
    const res = await apiClient.get<{ data: ExpenseReportDTO }>(
      `/reports/expenses${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },

  async getProfitReport(filter: ReportDateFilter = {}): Promise<ProfitReportDTO> {
    const res = await apiClient.get<{ data: ProfitReportDTO }>(
      `/reports/profit${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },

  async getProductPerformanceReport(filter: ReportDateFilter = {}): Promise<ProductPerformanceDTO> {
    const res = await apiClient.get<{ data: ProductPerformanceDTO }>(
      `/reports/products${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },

  async getInventoryValuationReport(): Promise<InventoryValuationDTO> {
    const res = await apiClient.get<{ data: InventoryValuationDTO }>(
      '/reports/inventory-valuation',
    );
    return res.data.data;
  },

  async getBalancesReport(): Promise<BalancesReportDTO> {
    const res = await apiClient.get<{ data: BalancesReportDTO }>('/reports/balances');
    return res.data.data;
  },

  async getWriteOffsReport(filter: ReportDateFilter = {}): Promise<WriteOffsReportDTO> {
    const res = await apiClient.get<{ data: WriteOffsReportDTO }>(
      `/reports/write-offs${buildFilterQuery(filter)}`,
    );
    return res.data.data;
  },
};
