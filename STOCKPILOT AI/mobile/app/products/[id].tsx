import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { productRepository } from '../../src/repositories/productRepository';
import {
  createAdjustStockSchema,
  stockRepository,
  type StockMovementDTO,
} from '../../src/repositories/stockRepository';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, stockStatusColors, typography } from '../../src/theme/tokens';

const ADJUSTMENT_TYPES = ['ADJUSTMENT', 'DAMAGED', 'EXPIRED'] as const;

type AdjustFormValues = {
  type: 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED';
  quantityChange: string;
  reason: string;
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: () => productRepository.getById(id),
    enabled: Boolean(id),
  });

  const movementsQuery = useQuery({
    queryKey: ['product-movements', id],
    queryFn: () => stockRepository.listByProduct(id, 1, 50),
    enabled: Boolean(id),
  });

  const product = productQuery.data;
  const adjustSchema = useMemo(
    () => createAdjustStockSchema(product?.unit ?? 'PIECE'),
    [product?.unit],
  );

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      type: 'ADJUSTMENT',
      quantityChange: '',
      reason: '',
    },
  });

  const adjustType = watch('type');

  const adjustMutation = useMutation({
    mutationFn: (values: AdjustFormValues) =>
      stockRepository.adjustStock(id, {
        type: values.type,
        quantityChange: values.quantityChange,
        reason: values.reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product', id] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-movements', id] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      reset({ type: 'ADJUSTMENT', quantityChange: '', reason: '' });
      setShowAdjustPanel(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => productRepository.archive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', id] });
      router.replace('/(tabs)/products');
    },
  });

  const confirmArchive = () => {
    Alert.alert(
      'Archive product?',
      'Archived products stay in reports and movement history, but cannot be used in new transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate() },
      ],
    );
  };

  if (productQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Product Details" />
        <LoadingState message="Loading product..." />
      </SafeAreaView>
    );
  }

  if (productQuery.isError || !product) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Product Details" />
        <ErrorState
          message={extractApiErrorMessage(productQuery.error, 'Product not found')}
          onRetry={() => void productQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const stockBadge =
    cmpDecimal(product.quantityOnHand, 0) <= 0
      ? { label: 'OUT OF STOCK', ...stockStatusColors.OUT }
      : product.isLowStock
        ? { label: 'LOW STOCK', ...stockStatusColors.LOW }
        : { label: 'IN STOCK', ...stockStatusColors.OK };

  const movements = movementsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={product.name}
        subtitle={product.categoryName ?? 'Uncategorized'}
        rightAction={
          <Pressable
            onPress={() => router.push(`/products/form?id=${product.id}`)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderInput,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.primary }}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 40 }}>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>
              {product.quantityOnHand} {product.unit}
            </Text>
            <StatusPill label={stockBadge.label} bg={stockBadge.bg} text={stockBadge.text} />
          </View>

          {product.sku ? (
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>SKU: {product.sku}</Text>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.md,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <View style={{ minWidth: '42%' }}>
              <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Selling price</Text>
              <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                {formatMoneyWithCurrency(product.sellingPrice, currency)}
              </Text>
            </View>
            <View style={{ minWidth: '42%' }}>
              <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Avg cost (COGS)</Text>
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                {formatMoneyWithCurrency(product.averageCost, currency)}
              </Text>
            </View>
            <View style={{ minWidth: '42%' }}>
              <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Last purchase cost</Text>
              <Text style={{ ...typography.bodyMd, color: colors.textPrimary }}>
                {formatMoneyWithCurrency(product.lastPurchaseCost, currency)}
              </Text>
            </View>
            <View style={{ minWidth: '42%' }}>
              <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Low-stock alert at</Text>
              <Text style={{ ...typography.bodyMd, color: colors.textPrimary }}>
                {product.minStockLevel} {product.unit}
              </Text>
            </View>
          </View>

          {product.description ? (
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>{product.description}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <PrimaryButton
            title={showAdjustPanel ? 'Hide Adjustment' : 'Adjust Stock'}
            onPress={() => setShowAdjustPanel((prev) => !prev)}
            style={{ flex: 1 }}
          />
          {!product.archivedAt ? (
            <PrimaryButton
              title="Archive"
              variant="danger"
              loading={archiveMutation.isPending}
              onPress={confirmArchive}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>

        {showAdjustPanel ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.primary,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Record Stock Adjustment</Text>

            {adjustMutation.isError ? (
              <View
                style={{
                  padding: 10,
                  borderRadius: radii.md,
                  backgroundColor: colors.errorBg,
                  borderWidth: 1,
                  borderColor: colors.errorBorder,
                }}
              >
                <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                  {extractApiErrorMessage(adjustMutation.error, 'Adjustment failed')}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ADJUSTMENT_TYPES.map((typeOption) => {
                const active = adjustType === typeOption;
                return (
                  <Pressable
                    key={typeOption}
                    onPress={() => setValue('type', typeOption)}
                    style={{
                      flex: 1,
                      minHeight: 40,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                      alignItems: 'center',
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
            </View>

            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
              {adjustType === 'ADJUSTMENT'
                ? 'Use positive (e.g. 5) to add stock or negative (e.g. -2) to reduce.'
                : `${adjustType} requires a negative quantity change (e.g. -2).`}
            </Text>

            <Controller
              control={control}
              name="quantityChange"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Quantity change"
                  required
                  keyboardType="numbers-and-punctuation"
                  placeholder={adjustType === 'ADJUSTMENT' ? 'e.g. 5 or -2' : 'e.g. -2'}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.quantityChange?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="reason"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Reason"
                  required
                  placeholder="e.g. Shelf recount or transit damage"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.reason?.message}
                />
              )}
            />

            <PrimaryButton
              title="Save Stock Movement"
              loading={adjustMutation.isPending}
              onPress={() => void handleSubmit((values) => adjustMutation.mutate(values))()}
            />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Movement History</Text>

          {movementsQuery.isLoading ? (
            <LoadingState message="Loading movements..." />
          ) : movements.length === 0 ? (
            <EmptyState
              icon="swap-vertical-outline"
              title="No stock movements yet"
              subtitle="Initial stock, purchases, sales, and adjustments appear here."
            />
          ) : (
            movements.map((mov: StockMovementDTO) => {
              const isPositive = cmpDecimal(mov.quantityChange, 0) > 0;
              return (
                <View
                  key={mov.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>{mov.type}</Text>
                    <Text
                      style={{
                        ...typography.titleMd,
                        color: isPositive ? colors.successText : colors.errorText,
                      }}
                    >
                      {isPositive ? `+${mov.quantityChange}` : mov.quantityChange} {product.unit}
                    </Text>
                  </View>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    Stock: {mov.previousQty} {'->'} {mov.newQty} {product.unit}
                  </Text>
                  {mov.reason ? (
                    <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                      Reason: {mov.reason}
                    </Text>
                  ) : null}
                  <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                    {new Date(mov.occurredAt).toLocaleString()}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
