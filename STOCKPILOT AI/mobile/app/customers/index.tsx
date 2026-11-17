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
import { customerRepository, type CustomerDTO } from '../../src/repositories/customerRepository';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

export default function CustomersScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [search, setSearch] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customers', { search }],
    queryFn: () => customerRepository.list({ search, pageSize: 100 }),
  });

  const items = customersQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Customers"
        subtitle="Manage shop customers & credit accounts"
        rightAction={
          <Pressable
            onPress={() => router.push('/customers/form')}
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
            placeholder="Search customer name or phone..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
        </View>
      </View>

      {customersQuery.isLoading ? (
        <LoadingState message="Loading customers..." />
      ) : customersQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(customersQuery.error, 'Could not load customers')}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No customers yet"
          subtitle="Add regular buyers to track sales and credit balances."
          actionLabel="Add Customer"
          onAction={() => router.push('/customers/form')}
        />
      ) : (
        <FlatList<CustomerDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={customersQuery.isRefetching}
          onRefresh={() => void customersQuery.refetch()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/customers/${item.id}`)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary, flex: 1 }}>
                    {item.name}
                  </Text>
                  {cmpDecimal(item.outstandingBalance ?? '0', 0) > 0 ? (
                    <StatusPill
                      label={`Due ${formatMoneyWithCurrency(item.outstandingBalance, currency)}`}
                      bg={colors.warningBg}
                      text={colors.warningText}
                    />
                  ) : null}
                </View>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                  {item.phone || 'No phone number'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
