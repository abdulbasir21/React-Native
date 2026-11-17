import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { saleRepository, type SaleDTO } from '../../src/repositories/saleRepository';
import type { ReportPeriod } from '../../src/shared/calculations';
import type { PaymentStatus } from '../../src/shared/enums';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import {
  colors,
  layout,
  paymentStatusColors,
  radii,
  spacing,
  typography,
} from '../../src/theme/tokens';

const PERIODS: Array<{ label: string; value: ReportPeriod | undefined }> = [
  { label: 'All Time', value: undefined },
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

const PAYMENT_FILTERS: Array<{ label: string; value: PaymentStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Paid', value: 'PAID' },
  { label: 'Partial', value: 'PARTIAL' },
  { label: 'Unpaid', value: 'UNPAID' },
];

export default function SalesHistoryScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<ReportPeriod | undefined>(undefined);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | undefined>(undefined);

  const salesQuery = useQuery({
    queryKey: ['sales', { search, period, paymentStatus }],
    queryFn: () =>
      saleRepository.list({
        search,
        period,
        paymentStatus,
        pageSize: 100,
      }),
  });

  const items = salesQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Sales History"
        subtitle="View completed & credit bills"
        rightAction={
          <Pressable
            onPress={() => router.replace('/(tabs)/sales')}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              backgroundColor: colors.primary,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.white }}>+ Sale</Text>
          </Pressable>
        }
      />

      <View
        style={{
          paddingHorizontal: spacing.screenPadding,
          paddingVertical: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            minHeight: layout.inputHeight,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.borderInput,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search receipt #, customer or item..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {PERIODS.map((opt) => {
            const active = period === opt.value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setPeriod(opt.value)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 12,
                  borderRadius: radii.pill,
                  justifyContent: 'center',
                  backgroundColor: active ? colors.primary : colors.background,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text
                  style={{
                    ...typography.labelMd,
                    color: active ? colors.white : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
          {PAYMENT_FILTERS.filter((f) => f.value !== undefined).map((opt) => {
            const active = paymentStatus === opt.value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setPaymentStatus(active ? undefined : opt.value)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 12,
                  borderRadius: radii.pill,
                  justifyContent: 'center',
                  backgroundColor: active ? colors.secondary : colors.background,
                  borderWidth: 1,
                  borderColor: active ? colors.secondary : colors.border,
                }}
              >
                <Text
                  style={{
                    ...typography.labelMd,
                    color: colors.textPrimary,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {salesQuery.isLoading ? (
        <LoadingState message="Loading sales..." />
      ) : salesQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(salesQuery.error, 'Could not load sales')}
          onRetry={() => void salesQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No sales found"
          subtitle="Completed POS bills appear here with receipts and payment status."
          actionLabel="Start a Sale"
          onAction={() => router.replace('/(tabs)/sales')}
        />
      ) : (
        <FlatList<SaleDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={salesQuery.isRefetching}
          onRefresh={() => void salesQuery.refetch()}
          renderItem={({ item }) => {
            const pStyle = paymentStatusColors[item.paymentStatus];
            const hasDue = cmpDecimal(item.balanceDue, 0) > 0;
            return (
              <Pressable
                onPress={() => router.push(`/sales/${item.id}`)}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    {item.receiptNo}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {item.status === 'CANCELLED' ? (
                      <StatusPill label="CANCELLED" bg={colors.errorBg} text={colors.errorText} />
                    ) : cmpDecimal(item.returnedValue, 0) > 0 ? (
                      <StatusPill label="RETURNED" bg={colors.infoBg} text={colors.infoText} />
                    ) : null}
                    <StatusPill label={item.paymentStatus} bg={pStyle.bg} text={pStyle.text} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    {item.customer?.name ?? 'Walk-in Customer'} •{' '}
                    {new Date(item.occurredAt).toLocaleDateString()}
                  </Text>
                  <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                    {formatMoneyWithCurrency(item.total, currency)}
                  </Text>
                </View>

                {hasDue ? (
                  <Text style={{ ...typography.labelMd, color: colors.warningText }}>
                    Balance due: {formatMoneyWithCurrency(item.balanceDue, currency)}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
