import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { categoryRepository } from '../../src/repositories/categoryRepository';
import { productRepository, type ProductDTO } from '../../src/repositories/productRepository';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, stockStatusColors, typography } from '../../src/theme/tokens';

function stockPillForProduct(item: ProductDTO) {
  if (cmpDecimal(item.quantityOnHand, 0) <= 0) {
    return { label: 'OUT OF STOCK', ...stockStatusColors.OUT };
  }
  if (item.isLowStock) {
    return { label: `LOW (${item.quantityOnHand})`, ...stockStatusColors.LOW };
  }
  return { label: `${item.quantityOnHand} ${item.unit}`, ...stockStatusColors.OK };
}

export default function ProductsTabScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoryRepository.list,
  });

  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryId: selectedCategoryId, lowStockOnly }],
    queryFn: () =>
      productRepository.list({
        search,
        categoryId: selectedCategoryId,
        lowStockOnly,
        pageSize: 100,
      }),
  });

  const items = productsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: spacing.screenPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ ...typography.headlineSm, color: colors.textPrimary }}>Products</Text>
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              {productsQuery.data?.meta?.total ?? items.length} active items
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => router.push('/stock-movements')}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="swap-vertical-outline" size={18} color={colors.textPrimary} />
              <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>History</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/products/form')}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: radii.md,
                backgroundColor: colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="add" size={20} color={colors.white} />
              <Text style={{ ...typography.labelLg, color: colors.white }}>Add</Text>
            </Pressable>
          </View>
        </View>

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
            placeholder="Search by product name or SKU..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => setSearch('')}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              setSelectedCategoryId(undefined);
              setLowStockOnly(false);
            }}
            style={{
              minHeight: 38,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: !selectedCategoryId && !lowStockOnly ? colors.primary : colors.border,
              backgroundColor: !selectedCategoryId && !lowStockOnly ? colors.primarySoft : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...typography.labelMd,
                color: !selectedCategoryId && !lowStockOnly ? colors.primary : colors.textSecondary,
              }}
            >
              All
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setLowStockOnly((prev) => !prev)}
            style={{
              minHeight: 38,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: lowStockOnly ? colors.warning : colors.border,
              backgroundColor: lowStockOnly ? colors.warningBg : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelMd, color: lowStockOnly ? colors.warningText : colors.textSecondary }}>
              Low Stock
            </Text>
          </Pressable>

          {(categoriesQuery.data ?? []).map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoryId(active ? undefined : cat.id)}
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
                <Text style={{ ...typography.labelMd, color: active ? colors.primary : colors.textSecondary }}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {productsQuery.isLoading ? (
        <LoadingState message="Loading products..." />
      ) : productsQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(productsQuery.error, 'Could not load products')}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="No products found"
          subtitle="Add your first product to track stock levels, average costs, and start selling."
          actionLabel="Add Product"
          onAction={() => router.push('/products/form')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={productsQuery.isRefetching}
          onRefresh={() => void productsQuery.refetch()}
          renderItem={({ item }) => {
            const pill = stockPillForProduct(item);
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{item.name}</Text>
                    <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                      {item.categoryName ? `${item.categoryName} · ` : ''}
                      {item.sku ? `SKU: ${item.sku}` : 'No SKU'}
                    </Text>
                  </View>
                  <StatusPill label={pill.label} bg={pill.bg} text={pill.text} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                    {formatMoneyWithCurrency(item.sellingPrice, currency)}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    Avg Cost: {formatMoneyWithCurrency(item.averageCost, currency)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
