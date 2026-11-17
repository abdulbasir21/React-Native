import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  reportRepository,
  validateCustomDateRange,
  type ReportDateFilter,
  type ReportPeriod,
} from '../../src/repositories/reportRepository';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

type ReportTab =
  | 'profit'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'products'
  | 'valuation'
  | 'balances'
  | 'writeoffs';

const REPORT_TABS: Array<{ key: ReportTab; label: string }> = [
  { key: 'profit', label: 'Profit' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'products', label: 'Products' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'balances', label: 'Balances' },
  { key: 'writeoffs', label: 'Write-offs' },
];

const PERIOD_OPTIONS: Array<{ key: ReportPeriod | 'custom'; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

function MetricRow({
  label,
  value,
  highlightColor,
}: {
  label: string;
  value: string;
  highlightColor?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.xs,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>{label}</Text>
      <Text
        style={{
          ...typography.titleMd,
          color: highlightColor ?? colors.textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const shop = useSessionStore((s) => s.shop);
  const currency = shop?.currency ?? 'PKR';

  const [tab, setTab] = useState<ReportTab>('profit');
  const [periodMode, setPeriodMode] = useState<ReportPeriod | 'custom'>('month');
  const [fromInput, setFromInput] = useState('2026-10-01');
  const [toInput, setToInput] = useState('2026-10-31');
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const filter: ReportDateFilter =
    periodMode === 'custom' && appliedRange
      ? { from: appliedRange.from, to: appliedRange.to }
      : { period: periodMode === 'custom' ? 'month' : periodMode };

  const filterKey =
    filter.from && filter.to ? `custom:${filter.from}:${filter.to}` : (filter.period ?? 'month');

  const queryEnabled = periodMode !== 'custom' || appliedRange !== null;

  const profitQ = useQuery({
    queryKey: ['report', 'profit', filterKey],
    queryFn: () => reportRepository.getProfitReport(filter),
    enabled: tab === 'profit' && queryEnabled,
  });
  const salesQ = useQuery({
    queryKey: ['report', 'sales', filterKey],
    queryFn: () => reportRepository.getSalesReport(filter),
    enabled: tab === 'sales' && queryEnabled,
  });
  const purchasesQ = useQuery({
    queryKey: ['report', 'purchases', filterKey],
    queryFn: () => reportRepository.getPurchasesReport(filter),
    enabled: tab === 'purchases' && queryEnabled,
  });
  const expensesQ = useQuery({
    queryKey: ['report', 'expenses', filterKey],
    queryFn: () => reportRepository.getExpenseReport(filter),
    enabled: tab === 'expenses' && queryEnabled,
  });
  const productsQ = useQuery({
    queryKey: ['report', 'products', filterKey],
    queryFn: () => reportRepository.getProductPerformanceReport(filter),
    enabled: tab === 'products' && queryEnabled,
  });
  const valuationQ = useQuery({
    queryKey: ['report', 'valuation'],
    queryFn: () => reportRepository.getInventoryValuationReport(),
    enabled: tab === 'valuation',
  });
  const balancesQ = useQuery({
    queryKey: ['report', 'balances'],
    queryFn: () => reportRepository.getBalancesReport(),
    enabled: tab === 'balances',
  });
  const writeOffsQ = useQuery({
    queryKey: ['report', 'writeoffs', filterKey],
    queryFn: () => reportRepository.getWriteOffsReport(filter),
    enabled: tab === 'writeoffs' && queryEnabled,
  });

  const activeQuery = {
    profit: profitQ,
    sales: salesQ,
    purchases: purchasesQ,
    expenses: expensesQ,
    products: productsQ,
    valuation: valuationQ,
    balances: balancesQ,
    writeoffs: writeOffsQ,
  }[tab];

  const handleApplyCustom = () => {
    const err = validateCustomDateRange(fromInput.trim(), toInput.trim());
    if (err) {
      setRangeError(err);
      return;
    }
    setRangeError(null);
    setAppliedRange({ from: fromInput.trim(), to: toInput.trim() });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isRefetching}
            onRefresh={() => activeQuery.refetch()}
          />
        }
      >
        <Text style={{ ...typography.headlineMd, color: colors.textPrimary }}>
          Reports & Analytics
        </Text>

        {/* Report Section Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {REPORT_TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.pill,
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...typography.labelMd,
                      color: active ? colors.white : colors.textPrimary,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Period Filter (hidden for point-in-time Valuation & Balances) */}
        {tab !== 'valuation' && tab !== 'balances' ? (
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.md,
                padding: 4,
                gap: 4,
              }}
            >
              {PERIOD_OPTIONS.map((p) => {
                const active = periodMode === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => {
                      setPeriodMode(p.key);
                      setRangeError(null);
                    }}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: radii.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? colors.surface : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        ...typography.labelMd,
                        color: active ? colors.primary : colors.textSecondary,
                      }}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {periodMode === 'custom' ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                      From (YYYY-MM-DD)
                    </Text>
                    <TextInput
                      value={fromInput}
                      onChangeText={setFromInput}
                      placeholder="2026-10-01"
                      style={{
                        minHeight: 44,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: radii.sm,
                        paddingHorizontal: spacing.sm,
                        color: colors.textPrimary,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                      To (YYYY-MM-DD)
                    </Text>
                    <TextInput
                      value={toInput}
                      onChangeText={setToInput}
                      placeholder="2026-10-31"
                      style={{
                        minHeight: 44,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: radii.sm,
                        paddingHorizontal: spacing.sm,
                        color: colors.textPrimary,
                      }}
                    />
                  </View>
                </View>
                {rangeError ? (
                  <Text style={{ ...typography.bodySm, color: colors.error }}>{rangeError}</Text>
                ) : null}
                <Pressable
                  onPress={handleApplyCustom}
                  style={{
                    minHeight: 44,
                    borderRadius: radii.sm,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.white }}>
                    Apply Range
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Content */}
        {activeQuery.isLoading ? (
          <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Loading report...
            </Text>
          </View>
        ) : activeQuery.error ? (
          <View
            style={{
              backgroundColor: colors.errorBg,
              borderRadius: radii.md,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.error }}>
              Could not load report
            </Text>
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              {activeQuery.error instanceof Error
                ? activeQuery.error.message
                : 'Please try again.'}
            </Text>
            <Pressable
              onPress={() => activeQuery.refetch()}
              style={{
                minHeight: 44,
                alignSelf: 'flex-start',
                paddingHorizontal: spacing.md,
                borderRadius: radii.sm,
                backgroundColor: colors.error,
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...typography.labelMd, color: colors.white }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {tab === 'profit' && profitQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Profit & Cash Flow ({profitQ.data.fromDate} → {profitQ.data.toDate})
            </Text>
            <MetricRow label="Revenue (net of returns)" value={`${currency} ${profitQ.data.revenue}`} />
            <MetricRow label="Cost of Goods Sold (COGS)" value={`${currency} ${profitQ.data.cogs}`} />
            <MetricRow label="Gross Profit" value={`${currency} ${profitQ.data.grossProfit}`} />
            <MetricRow
              label="Operating Expenses"
              value={`${currency} ${profitQ.data.operatingExpenses}`}
            />
            <MetricRow
              label="Estimated Profit (Net Operating)"
              value={`${currency} ${profitQ.data.netOperatingProfit}`}
              highlightColor={colors.success}
            />
            <MetricRow
              label="Cash Received (separate from profit)"
              value={`${currency} ${profitQ.data.cashReceived}`}
              highlightColor={colors.primary}
            />
            <MetricRow
              label="Cash Paid to Suppliers"
              value={`${currency} ${profitQ.data.cashPaidToSuppliers}`}
            />
            <MetricRow
              label="Inventory Write-offs (separate)"
              value={`${currency} ${profitQ.data.writeOffs}`}
              highlightColor={colors.warning}
            />
          </View>
        ) : null}

        {tab === 'sales' && salesQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Sales Summary ({salesQ.data.fromDate} → {salesQ.data.toDate})
            </Text>
            <MetricRow label="Net Revenue" value={`${currency} ${salesQ.data.revenue}`} />
            <MetricRow label="Completed Sales" value={String(salesQ.data.salesCount)} />
            <MetricRow label="Cancelled Sales (excluded)" value={String(salesQ.data.cancelledCount)} />
            <MetricRow label="Returned Value" value={`${currency} ${salesQ.data.returnedValue}`} />
            <MetricRow label="COGS" value={`${currency} ${salesQ.data.cogs}`} />
            <MetricRow label="Gross Profit" value={`${currency} ${salesQ.data.grossProfit}`} />
          </View>
        ) : null}

        {tab === 'purchases' && purchasesQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Purchases ({purchasesQ.data.fromDate} → {purchasesQ.data.toDate})
            </Text>
            <MetricRow
              label="Total Purchases"
              value={`${currency} ${purchasesQ.data.totalPurchases}`}
            />
            <MetricRow label="Purchase Count" value={String(purchasesQ.data.purchaseCount)} />
            <MetricRow
              label="Cash Paid to Suppliers"
              value={`${currency} ${purchasesQ.data.cashPaidToSuppliers}`}
            />
          </View>
        ) : null}

        {tab === 'expenses' && expensesQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Expenses ({expensesQ.data.fromDate} → {expensesQ.data.toDate})
            </Text>
            <MetricRow
              label="Total Expenses"
              value={`${currency} ${expensesQ.data.totalExpenses}`}
            />
            <MetricRow label="Entries" value={String(expensesQ.data.expenseCount)} />
            {expensesQ.data.byCategory.map((c) => (
              <MetricRow
                key={c.category}
                label={`${c.category} (${c.count})`}
                value={`${currency} ${c.total}`}
              />
            ))}
          </View>
        ) : null}

        {tab === 'products' && productsQ.data ? (
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Best-Selling Products
              </Text>
              {productsQ.data.bestSelling.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  No sales in this period.
                </Text>
              ) : (
                productsQ.data.bestSelling.map((p) => (
                  <MetricRow
                    key={p.productId}
                    label={`${p.name} (${p.netQuantitySold} ${p.unit})`}
                    value={`${currency} ${p.netRevenue}`}
                  />
                ))
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Slow-Moving (30+ days)
              </Text>
              {productsQ.data.slowMoving.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  No slow-moving stock.
                </Text>
              ) : (
                productsQ.data.slowMoving.map((p) => (
                  <MetricRow
                    key={p.productId}
                    label={p.name}
                    value={`${p.quantityOnHand} ${p.unit}`}
                  />
                ))
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Low Stock</Text>
              {productsQ.data.lowStock.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  All products above minimum stock level.
                </Text>
              ) : (
                productsQ.data.lowStock.map((p) => (
                  <MetricRow
                    key={p.productId}
                    label={`${p.name} (min ${p.minStockLevel})`}
                    value={`${p.quantityOnHand} ${p.unit}`}
                    highlightColor={colors.error}
                  />
                ))
              )}
            </View>
          </View>
        ) : null}

        {tab === 'valuation' && valuationQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Inventory Valuation
            </Text>
            <MetricRow
              label="Total Inventory Value"
              value={`${currency} ${valuationQ.data.totalValue}`}
              highlightColor={colors.primary}
            />
            <MetricRow
              label="Active / Total Products"
              value={`${valuationQ.data.activeProductCount} / ${valuationQ.data.totalProductCount}`}
            />
            <MetricRow
              label="Negative Stock Count"
              value={String(valuationQ.data.negativeStockCount)}
            />
            {valuationQ.data.items.map((item) => (
              <MetricRow
                key={item.productId}
                label={`${item.name} (${item.quantityOnHand} @ ${item.averageCost})`}
                value={`${currency} ${item.valuation}`}
              />
            ))}
          </View>
        ) : null}

        {tab === 'balances' && balancesQ.data ? (
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Customer Receivables
              </Text>
              <MetricRow
                label="Total Customer Outstanding"
                value={`${currency} ${balancesQ.data.totalCustomerOutstanding}`}
                highlightColor={colors.warning}
              />
              {balancesQ.data.customers.map((c) => (
                <MetricRow
                  key={c.customerId}
                  label={c.name}
                  value={`${currency} ${c.balance}`}
                />
              ))}
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Supplier Payables
              </Text>
              <MetricRow
                label="Total Supplier Payable"
                value={`${currency} ${balancesQ.data.totalSupplierPayable}`}
              />
              {balancesQ.data.suppliers.map((s) => (
                <MetricRow
                  key={s.supplierId}
                  label={s.name}
                  value={`${currency} ${s.balance}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        {tab === 'writeoffs' && writeOffsQ.data ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Inventory Write-offs (Damaged & Expired)
            </Text>
            <MetricRow
              label="Total Write-off Value"
              value={`${currency} ${writeOffsQ.data.totalWriteOffValue}`}
              highlightColor={colors.warning}
            />
            {writeOffsQ.data.items.length === 0 ? (
              <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                No write-offs in this period.
              </Text>
            ) : (
              writeOffsQ.data.items.map((w) => (
                <MetricRow
                  key={w.movementId}
                  label={`${w.productName} (${w.type} × ${w.quantity})`}
                  value={`${currency} ${w.value}`}
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
