import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getShopApi } from '../../src/api/authApi';
import { StatusPill } from '../../src/components/StatusPill';
import { reportRepository, type ReportPeriod } from '../../src/repositories/reportRepository';
import { useSessionStore } from '../../src/stores/sessionStore';
import {
  colors,
  paymentStatusColors,
  radii,
  spacing,
  typography,
} from '../../src/theme/tokens';

const PERIODS: Array<{ key: ReportPeriod; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function HomeDashboardScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const storeShop = useSessionStore((s) => s.shop);
  const [period, setPeriod] = useState<ReportPeriod>('today');

  const { data: liveShop } = useQuery({
    queryKey: ['shop'],
    queryFn: getShopApi,
  });
  const shop = liveShop ?? storeShop;
  const currency = shop?.currency ?? 'PKR';

  const {
    data: dashboard,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => reportRepository.getDashboard(period),
  });

  const chartData = (dashboard?.salesChart ?? []).map((pt) => ({
    value: Number(pt.revenue) || 0,
    label: pt.date.slice(5),
    frontColor: colors.primary,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: spacing.xl,
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>
              {user?.ownerName ?? 'Owner'}
            </Text>
            <Text style={{ ...typography.headlineMd, color: colors.textPrimary }} numberOfLines={1}>
              {shop?.name ?? 'StockPilot AI'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Pressable
              onPress={() => router.push('/ai')}
              style={{
                minWidth: 44,
                minHeight: 44,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: colors.primarySoft,
                borderWidth: 1,
                borderColor: colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <Text style={{ ...typography.labelMd, color: colors.primary }}>AI</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/reports')}
              style={{
                minWidth: 44,
                minHeight: 44,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
              <Text style={{ ...typography.labelMd, color: colors.primary }}>Reports</Text>
            </Pressable>
          </View>
        </View>

        {/* Period Switch */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: colors.surfaceSubtle,
            borderRadius: radii.md,
            padding: 4,
            gap: 4,
          }}
        >
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: radii.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.surface : 'transparent',
                  borderWidth: active ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
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

        {/* Quick Actions */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() => router.push('/sales/cart')}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.white }}>+ New Sale</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/purchases/new')}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>+ Purchase</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/expenses/form')}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>+ Expense</Text>
          </Pressable>
        </View>

        {isLoading && !dashboard ? (
          <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Loading dashboard...
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              backgroundColor: colors.errorBg,
              borderRadius: radii.md,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.error }}>
              Could not load dashboard
            </Text>
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              {error instanceof Error ? error.message : 'Please try again.'}
            </Text>
            <Pressable
              onPress={() => refetch()}
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
        ) : dashboard ? (
          <>
            {/* Primary KPI Grid — Estimated profit & Cash received clearly separated */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 4,
                }}
              >
                <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                  Sales ({dashboard.salesCount})
                </Text>
                <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>
                  {currency} {dashboard.sales}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 4,
                }}
              >
                <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                  Estimated profit
                </Text>
                <Text style={{ ...typography.titleLg, color: colors.success }}>
                  {currency} {dashboard.estimatedProfit}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  After COGS & expenses
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 4,
                }}
              >
                <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                  Cash received
                </Text>
                <Text style={{ ...typography.titleLg, color: colors.primary }}>
                  {currency} {dashboard.cashReceived}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  Net customer cash
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 4,
                }}
              >
                <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>Expenses</Text>
                <Text style={{ ...typography.titleLg, color: colors.warning }}>
                  {currency} {dashboard.expenses}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  Paid to suppliers: {currency} {dashboard.cashPaidToSuppliers}
                </Text>
              </View>
            </View>

            {/* Inventory & Balances Row */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                    Inventory Value
                  </Text>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    {currency} {dashboard.inventoryValue}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                    Products / Low Stock
                  </Text>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    {dashboard.productCount} /{' '}
                    <Text
                      style={{
                        color: dashboard.lowStockCount > 0 ? colors.error : colors.success,
                      }}
                    >
                      {dashboard.lowStockCount} low
                    </Text>
                  </Text>
                </View>
              </View>
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                    Customer Outstanding
                  </Text>
                  <Text style={{ ...typography.titleMd, color: colors.warning }}>
                    {currency} {dashboard.customerOutstanding}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                    Supplier Payable
                  </Text>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    {currency} {dashboard.supplierPayable}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sales Chart */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Sales Over Period
              </Text>
              {chartData.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  No sales recorded in this period.
                </Text>
              ) : (
                <BarChart
                  data={chartData}
                  barWidth={28}
                  spacing={16}
                  roundedTop
                  noOfSections={4}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={colors.border}
                  yAxisTextStyle={{ color: colors.textMuted, fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 11 }}
                  height={160}
                />
              )}
            </View>

            {/* Recent 5 Sales */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  Recent Sales
                </Text>
                <Pressable
                  onPress={() => router.push('/sales/history')}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.primary }}>View all</Text>
                </Pressable>
              </View>
              {dashboard.recentSales.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  No sales yet.
                </Text>
              ) : (
                dashboard.recentSales.map((s) => {
                  const badge =
                    paymentStatusColors[s.paymentStatus as keyof typeof paymentStatusColors] ??
                    paymentStatusColors.NOT_APPLICABLE;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => router.push(`/sales/${s.id}`)}
                      style={{
                        minHeight: 48,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: spacing.xs,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                          {s.receiptNo} · {s.customerName ?? 'Walk-in'}
                        </Text>
                        <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                          {new Date(s.occurredAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                          {currency} {s.netTotal}
                        </Text>
                        <StatusPill
                          label={s.status === 'CANCELLED' ? 'CANCELLED' : s.paymentStatus}
                          bg={badge.bg}
                          text={badge.text}
                        />
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Recent 5 Purchases */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  Recent Purchases
                </Text>
                <Pressable
                  onPress={() => router.push('/purchases')}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.primary }}>View all</Text>
                </Pressable>
              </View>
              {dashboard.recentPurchases.length === 0 ? (
                <Text style={{ ...typography.bodyMd, color: colors.textMuted }}>
                  No purchases yet.
                </Text>
              ) : (
                dashboard.recentPurchases.map((p) => {
                  const badge =
                    paymentStatusColors[p.paymentStatus as keyof typeof paymentStatusColors] ??
                    paymentStatusColors.NOT_APPLICABLE;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push(`/purchases/${p.id}`)}
                      style={{
                        minHeight: 48,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: spacing.xs,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                          {p.supplierName}
                        </Text>
                        <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                          {new Date(p.occurredAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                          {currency} {p.total}
                        </Text>
                        <StatusPill label={p.paymentStatus} bg={badge.bg} text={badge.text} />
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
