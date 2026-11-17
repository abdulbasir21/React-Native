import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { cmpDecimal, formatMoneyWithCurrency, formatQuantity } from '../../src/shared/money';
import { computeCartSummary, usePosCartStore } from '../../src/stores/posCartStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import {
  colors,
  layout,
  radii,
  spacing,
  stockStatusColors,
  typography,
} from '../../src/theme/tokens';

function stockBadge(item: ProductDTO) {
  if (cmpDecimal(item.quantityOnHand, 0) <= 0) {
    return { label: 'OUT OF STOCK', ...stockStatusColors.OUT };
  }
  if (item.isLowStock) {
    return { label: `LOW (${formatQuantity(item.quantityOnHand)})`, ...stockStatusColors.LOW };
  }
  return {
    label: `${formatQuantity(item.quantityOnHand)} ${item.unit}`,
    ...stockStatusColors.OK,
  };
}

export default function PosSalesTabScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);

  const itemsInCart = usePosCartStore((s) => s.items);
  const discountType = usePosCartStore((s) => s.discountType);
  const discountValue = usePosCartStore((s) => s.discountValue);
  const customerId = usePosCartStore((s) => s.customerId);
  const note = usePosCartStore((s) => s.note);
  const paymentMethod = usePosCartStore((s) => s.paymentMethod);
  const tenderedAmount = usePosCartStore((s) => s.tenderedAmount);
  const addProduct = usePosCartStore((s) => s.addProduct);
  const resetCart = usePosCartStore((s) => s.reset);

  const cartSummary = useMemo(
    () =>
      computeCartSummary({
        items: itemsInCart,
        discountType,
        discountValue,
        customerId,
        note,
        paymentMethod,
        tenderedAmount,
      }),
    [itemsInCart, discountType, discountValue, customerId, note, paymentMethod, tenderedAmount],
  );

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of itemsInCart) {
      map.set(line.productId, line.quantity);
    }
    return map;
  }, [itemsInCart]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoryRepository.list,
  });

  const productsQuery = useQuery({
    queryKey: ['products', { posSearch: search, categoryId: selectedCategoryId }],
    queryFn: () =>
      productRepository.list({
        search,
        categoryId: selectedCategoryId,
        includeArchived: false,
        pageSize: 100,
      }),
  });

  const products = productsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: spacing.screenPadding,
          paddingVertical: spacing.md,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ ...typography.headlineMd, color: colors.textPrimary }}>New Sale</Text>
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              Tap products to add to bill
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/sales/history')}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderInput,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={{ ...typography.labelLg, color: colors.primary }}>History</Text>
          </Pressable>
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
            placeholder="Search products or SKU..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
          {search ? (
            <Pressable
              onPress={() => setSearch('')}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
        >
          <Pressable
            onPress={() => setSelectedCategoryId(undefined)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              justifyContent: 'center',
              backgroundColor: selectedCategoryId === undefined ? colors.primary : colors.background,
              borderWidth: 1,
              borderColor: selectedCategoryId === undefined ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{
                ...typography.labelMd,
                color: selectedCategoryId === undefined ? colors.white : colors.textSecondary,
              }}
            >
              All
            </Text>
          </Pressable>
          {(categoriesQuery.data ?? []).map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoryId(active ? undefined : cat.id)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
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
      ) : products.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="No matching products"
          subtitle="Try clearing your search filter or add a new product in the Products tab."
        />
      ) : (
        <FlatList<ProductDTO>
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{
            padding: spacing.screenPadding,
            gap: spacing.sm,
            paddingBottom: cartSummary.itemCount > 0 ? 112 : 28,
          }}
          refreshing={productsQuery.isRefetching}
          onRefresh={() => void productsQuery.refetch()}
          renderItem={({ item }) => {
            const outOfStock = cmpDecimal(item.quantityOnHand, 0) <= 0;
            const badge = stockBadge(item);
            const inCartQty = qtyByProduct.get(item.id);
            return (
              <Pressable
                onPress={() =>
                  addProduct({
                    id: item.id,
                    name: item.name,
                    unit: item.unit,
                    sellingPrice: item.sellingPrice,
                    quantityOnHand: item.quantityOnHand,
                  })
                }
                disabled={outOfStock}
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  borderWidth: inCartQty ? 1.5 : 1,
                  borderColor: inCartQty ? colors.primary : colors.border,
                  padding: spacing.md,
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                  opacity: outOfStock ? 0.55 : 1,
                  minHeight: 144,
                }}
              >
                <View style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <StatusPill label={badge.label} bg={badge.bg} text={badge.text} />
                    {inCartQty ? (
                      <View
                        style={{
                          minWidth: 24,
                          height: 24,
                          paddingHorizontal: 6,
                          borderRadius: radii.pill,
                          backgroundColor: colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ ...typography.labelSm, color: colors.white }}>{inCartQty}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{ ...typography.titleMd, color: colors.textPrimary, marginTop: 4 }}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.textMuted }} numberOfLines={1}>
                    {item.categoryName ?? item.unit}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  }}
                >
                  <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                    {formatMoneyWithCurrency(item.sellingPrice, currency)}
                  </Text>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: radii.md,
                      backgroundColor: outOfStock ? colors.divider : colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={20}
                      color={outOfStock ? colors.textMuted : colors.primary}
                    />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {cartSummary.itemCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.screenPadding,
            right: spacing.screenPadding,
            bottom: spacing.md,
            minHeight: layout.stickyFooterMinHeight,
            backgroundColor: colors.primaryDark,
            borderRadius: radii.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <Pressable
            onPress={resetCart}
            style={{
              minWidth: 44,
              minHeight: 44,
              borderRadius: radii.md,
              backgroundColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="Clear cart"
          >
            <Ionicons name="trash-outline" size={20} color={colors.white} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/sales/cart')}
            style={{
              flex: 1,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 4,
            }}
          >
            <View>
              <Text style={{ ...typography.labelMd, color: colors.primaryFixed }}>
                {cartSummary.itemCount} {cartSummary.itemCount === 1 ? 'item' : 'items'} in cart
              </Text>
              <Text style={{ ...typography.currencyMd, color: colors.white }}>
                {formatMoneyWithCurrency(cartSummary.total, currency)}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.secondary,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: radii.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>View Cart</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
