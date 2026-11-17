import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { expenseRepository, type ExpenseDTO } from '../../src/repositories/expenseRepository';
import type { ReportPeriod } from '../../src/shared/calculations';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../src/shared/enums';
import { formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

const PERIOD_OPTIONS: Array<{ key: ReportPeriod | undefined; label: string }> = [
  { key: 'month', label: 'This Month' },
  { key: 'week', label: 'This Week' },
  { key: 'today', label: 'Today' },
  { key: undefined, label: 'All Time' },
];

export default function ExpensesScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [period, setPeriod] = useState<ReportPeriod | undefined>('month');
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);

  const expensesQuery = useQuery({
    queryKey: ['expenses', { period, category }],
    queryFn: () => expenseRepository.list({ period, category, pageSize: 100 }),
  });

  const items = expensesQuery.data?.items ?? [];
  const totalAmount = expensesQuery.data?.meta?.totalAmount ?? '0.00';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Expenses"
        subtitle="Track & edit shop operating expenses"
        rightAction={
          <Pressable
            onPress={() => router.push('/expenses/form')}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              backgroundColor: colors.primary,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.white }}>+ Add</Text>
          </Pressable>
        }
      />

      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <View
          style={{
            marginHorizontal: spacing.screenPadding,
            padding: 12,
            borderRadius: radii.md,
            backgroundColor: colors.primarySoft,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ ...typography.labelLg, color: colors.primaryDark }}>Filtered Total</Text>
          <Text style={{ ...typography.currencyMd, color: colors.primary }}>
            {formatMoneyWithCurrency(totalAmount, currency)}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding, gap: 8 }}
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.key;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setPeriod(opt.key)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 14,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.labelMd, color: active ? colors.primary : colors.textSecondary }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding, gap: 8 }}
        >
          <Pressable
            onPress={() => setCategory(undefined)}
            style={{
              minHeight: 36,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: !category ? colors.primary : colors.border,
              backgroundColor: !category ? colors.primarySoft : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelMd, color: !category ? colors.primary : colors.textSecondary }}>
              ALL CATEGORIES
            </Text>
          </Pressable>

          {EXPENSE_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(active ? undefined : cat)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 14,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.labelMd, color: active ? colors.primary : colors.textSecondary }}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {expensesQuery.isLoading ? (
        <LoadingState message="Loading expenses..." />
      ) : expensesQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(expensesQuery.error, 'Could not load expenses')}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No expenses for this filter"
          subtitle="Record rent, electricity, salaries, or other expenses to track net profit."
          actionLabel="Add Expense"
          onAction={() => router.push('/expenses/form')}
        />
      ) : (
        <FlatList<ExpenseDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={expensesQuery.isRefetching}
          onRefresh={() => void expensesQuery.refetch()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/expenses/form?id=${item.id}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{item.title}</Text>
                <Text style={{ ...typography.labelMd, color: colors.primary }}>
                  {item.category} · {item.paymentMethod}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  {new Date(item.expenseDate).toLocaleString()}
                </Text>
              </View>
              <Text style={{ ...typography.currencyMd, color: colors.errorText }}>
                {formatMoneyWithCurrency(item.amount, currency)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
