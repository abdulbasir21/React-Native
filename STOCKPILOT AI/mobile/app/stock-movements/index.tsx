import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { stockRepository, type StockMovementDTO } from '../../src/repositories/stockRepository';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '../../src/shared/enums';
import { cmpDecimal } from '../../src/shared/money';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

export default function StockMovementsScreen() {
  const [selectedType, setSelectedType] = useState<StockMovementType | undefined>(undefined);

  const movementsQuery = useQuery({
    queryKey: ['stock-movements', { type: selectedType }],
    queryFn: () => stockRepository.listAll({ type: selectedType, pageSize: 100 }),
  });

  const items = movementsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Stock Movements" subtitle="Immutable inventory audit trail" />

      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding, paddingVertical: 10, gap: 8 }}
        >
          <Pressable
            onPress={() => setSelectedType(undefined)}
            style={{
              minHeight: 38,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: !selectedType ? colors.primary : colors.border,
              backgroundColor: !selectedType ? colors.primarySoft : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...typography.labelMd,
                color: !selectedType ? colors.primary : colors.textSecondary,
              }}
            >
              ALL
            </Text>
          </Pressable>

          {STOCK_MOVEMENT_TYPES.map((typeOption) => {
            const active = selectedType === typeOption;
            return (
              <Pressable
                key={typeOption}
                onPress={() => setSelectedType(active ? undefined : typeOption)}
                style={{
                  minHeight: 38,
                  paddingHorizontal: 14,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    ...typography.labelMd,
                    color: active ? colors.primary : colors.textSecondary,
                  }}
                >
                  {typeOption}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {movementsQuery.isLoading ? (
        <LoadingState message="Loading stock movements..." />
      ) : movementsQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(movementsQuery.error, 'Could not load stock movements')}
          onRetry={() => void movementsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="swap-vertical-outline"
          title="No movements found"
          subtitle="Try clearing filters or record stock changes on a product."
        />
      ) : (
        <FlatList<StockMovementDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm, paddingBottom: 32 }}
          onRefresh={() => void movementsQuery.refetch()}
          refreshing={movementsQuery.isRefetching}
          renderItem={({ item }) => {
            const isPositive = cmpDecimal(item.quantityChange, 0) > 0;
            const unit = item.productUnit ?? '';
            return (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 14,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                    {item.productName ?? 'Product'}
                  </Text>
                  <Text
                    style={{
                      ...typography.titleMd,
                      color: isPositive ? colors.successText : colors.errorText,
                    }}
                  >
                    {isPositive ? `+${item.quantityChange}` : item.quantityChange} {unit}
                  </Text>
                </View>

                <Text style={{ ...typography.labelMd, color: colors.primary }}>{item.type}</Text>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                  Balance: {item.previousQty} {'->'} {item.newQty} {unit}
                </Text>
                {item.reason ? (
                  <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                    Reason: {item.reason}
                  </Text>
                ) : null}
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  {new Date(item.occurredAt).toLocaleString()}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
