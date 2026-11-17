import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { purchaseRepository, type PurchaseDTO } from '../../src/repositories/purchaseRepository';
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

export default function PurchasesScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [search, setSearch] = useState('');

  const purchasesQuery = useQuery({
    queryKey: ['purchases', { search }],
    queryFn: () => purchaseRepository.list({ search, pageSize: 100 }),
  });

  const items = purchasesQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Purchases"
        subtitle="Stock restocks & supplier bills"
        rightAction={
          <Pressable
            onPress={() => router.push('/purchases/new')}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              backgroundColor: colors.primary,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.white }}>+ New</Text>
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
            placeholder="Search by supplier or note..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
        </View>
      </View>

      {purchasesQuery.isLoading ? (
        <LoadingState message="Loading purchases..." />
      ) : purchasesQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(purchasesQuery.error, 'Could not load purchases')}
          onRetry={() => void purchasesQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="No purchases recorded"
          subtitle="Record supplier purchases to add stock and update weighted average cost."
          actionLabel="Record Purchase"
          onAction={() => router.push('/purchases/new')}
        />
      ) : (
        <FlatList<PurchaseDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={purchasesQuery.isRefetching}
          onRefresh={() => void purchasesQuery.refetch()}
          renderItem={({ item }) => {
            const statusStyle = paymentStatusColors[item.paymentStatus];
            const hasBalance = cmpDecimal(item.balanceDue, 0) > 0;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/purchases/[id]', params: { id: item.id } })}
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
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                    {item.supplierName ?? 'Supplier'}
                  </Text>
                  <StatusPill label={item.paymentStatus} bg={statusStyle.bg} text={statusStyle.text} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                    {formatMoneyWithCurrency(item.total, currency)}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: hasBalance ? colors.errorText : colors.textSecondary }}>
                    {hasBalance
                      ? `Due: ${formatMoneyWithCurrency(item.balanceDue, currency)}`
                      : `Paid: ${formatMoneyWithCurrency(item.amountPaid, currency)}`}
                  </Text>
                </View>

                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  {new Date(item.occurredAt).toLocaleString()} · {item.items?.length ?? 0} item(s)
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
