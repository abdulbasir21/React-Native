import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { categoryRepository } from '../../src/repositories/categoryRepository';
import {
  productFormSchema,
  productRepository,
  type ProductFormValues,
} from '../../src/repositories/productRepository';
import { DECIMAL_UNITS, UNITS } from '../../src/shared/enums';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [showQuickAddCategory, setShowQuickAddCategory] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoryRepository.list,
  });

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: () => productRepository.getById(id!),
    enabled: isEditing && Boolean(id),
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      categoryId: null,
      sku: '',
      description: '',
      unit: 'PIECE',
      purchaseCost: '',
      sellingPrice: '',
      initialQuantity: '0',
      minStockLevel: '0',
    },
  });

  useEffect(() => {
    if (productQuery.data) {
      reset({
        name: productQuery.data.name,
        categoryId: productQuery.data.categoryId,
        sku: productQuery.data.sku ?? '',
        description: productQuery.data.description ?? '',
        unit: productQuery.data.unit,
        purchaseCost: productQuery.data.purchaseCost,
        sellingPrice: productQuery.data.sellingPrice,
        initialQuantity: '0',
        minStockLevel: productQuery.data.minStockLevel,
      });
    }
  }, [productQuery.data, reset]);

  const selectedUnit = watch('unit');
  const selectedCategoryId = watch('categoryId');

  const quickAddCategoryMutation = useMutation({
    mutationFn: (name: string) => categoryRepository.create({ name }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      setValue('categoryId', created.id);
      setNewCategoryName('');
      setShowQuickAddCategory(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      if (isEditing && id) {
        return productRepository.update(id, {
          name: values.name,
          categoryId: values.categoryId ?? null,
          sku: values.sku,
          description: values.description,
          unit: values.unit,
          purchaseCost: values.purchaseCost,
          sellingPrice: values.sellingPrice,
          minStockLevel: values.minStockLevel,
        });
      }
      return productRepository.create(values);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', saved.id] });
      router.back();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => productRepository.archive(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', id] });
      router.replace('/(tabs)/products');
    },
  });

  const handleArchivePress = () => {
    if (!id) return;
    Alert.alert(
      'Archive product?',
      'Archived products are hidden from new sales and purchases, while keeping past history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate() },
      ],
    );
  };

  if (isEditing && productQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Product" />
        <LoadingState message="Loading product..." />
      </SafeAreaView>
    );
  }

  if (isEditing && productQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Product" />
        <ErrorState
          message={extractApiErrorMessage(productQuery.error, 'Unable to load product')}
          onRetry={() => void productQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const onSubmit = handleSubmit((values) => {
    saveMutation.mutate(values);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={isEditing ? 'Edit Product' : 'Add Product'} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {saveMutation.isError ? (
            <View
              style={{
                padding: 12,
                borderRadius: radii.md,
                backgroundColor: colors.errorBg,
                borderWidth: 1,
                borderColor: colors.errorBorder,
              }}
            >
              <Text style={{ ...typography.bodyMd, color: colors.errorText }}>
                {extractApiErrorMessage(saveMutation.error, 'Failed to save product')}
              </Text>
            </View>
          ) : null}

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Product name"
                required
                placeholder="e.g. Samsung 25W Charger"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Category</Text>
              <Pressable
                onPress={() => setShowQuickAddCategory((prev) => !prev)}
                style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ ...typography.labelMd, color: colors.primary }}>
                  {showQuickAddCategory ? 'Close' : '+ Quick Add'}
                </Text>
              </Pressable>
            </View>

            {showQuickAddCategory ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="New category name"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    flex: 1,
                    minHeight: layout.inputHeight,
                    backgroundColor: colors.surface,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: colors.borderInput,
                    paddingHorizontal: 12,
                    color: colors.textPrimary,
                  }}
                />
                <Pressable
                  onPress={() => {
                    const trimmed = newCategoryName.trim();
                    if (trimmed.length > 0) {
                      quickAddCategoryMutation.mutate(trimmed);
                    }
                  }}
                  disabled={quickAddCategoryMutation.isPending}
                  style={{
                    minHeight: layout.inputHeight,
                    paddingHorizontal: 16,
                    borderRadius: radii.md,
                    backgroundColor: colors.primary,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.labelLg, color: colors.white }}>Add</Text>
                </Pressable>
              </View>
            ) : null}

            {quickAddCategoryMutation.isError ? (
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                {extractApiErrorMessage(quickAddCategoryMutation.error, 'Could not add category')}
              </Text>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setValue('categoryId', null)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: !selectedCategoryId ? colors.primary : colors.border,
                  backgroundColor: !selectedCategoryId ? colors.primarySoft : colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    ...typography.labelMd,
                    color: !selectedCategoryId ? colors.primary : colors.textSecondary,
                  }}
                >
                  Uncategorized
                </Text>
              </Pressable>

              {(categoriesQuery.data ?? []).map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setValue('categoryId', cat.id)}
                    style={{
                      minHeight: 40,
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
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Unit</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {UNITS.map((unit) => {
                const active = selectedUnit === unit;
                return (
                  <Pressable
                    key={unit}
                    onPress={() => setValue('unit', unit)}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: 14,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        ...typography.labelMd,
                        color: active ? colors.primary : colors.textPrimary,
                      }}
                    >
                      {unit}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
              {DECIMAL_UNITS.includes(selectedUnit)
                ? `${selectedUnit} supports fractional quantities (up to 3 decimals).`
                : `${selectedUnit} requires whole-number quantities only.`}
            </Text>
          </View>

          <Controller
            control={control}
            name="sku"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="SKU / Barcode (optional)"
                placeholder="e.g. CHG-25W"
                autoCapitalize="characters"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.sku?.message}
              />
            )}
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="purchaseCost"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Purchase cost"
                    required
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.purchaseCost?.message}
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="sellingPrice"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Selling price"
                    required
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.sellingPrice?.message}
                  />
                )}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!isEditing ? (
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name="initialQuantity"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="Initial stock"
                      keyboardType="decimal-pad"
                      placeholder="0"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.initialQuantity?.message}
                    />
                  )}
                />
              </View>
            ) : null}

            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="minStockLevel"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Low-stock alert at"
                    keyboardType="decimal-pad"
                    placeholder="0"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.minStockLevel?.message}
                  />
                )}
              />
            </View>
          </View>

          {isEditing ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              Stock on hand ({productQuery.data?.quantityOnHand} {productQuery.data?.unit}) can only be
              changed via Adjust Stock on the product details screen.
            </Text>
          ) : null}

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Notes / description (optional)"
                placeholder="Short description"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.description?.message}
              />
            )}
          />

          <PrimaryButton
            title={isEditing ? 'Save Changes' : 'Create Product'}
            loading={saveMutation.isPending}
            onPress={() => void onSubmit()}
          />

          {isEditing && !productQuery.data?.archivedAt ? (
            <PrimaryButton
              title="Archive Product"
              variant="danger"
              loading={archiveMutation.isPending}
              onPress={handleArchivePress}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
