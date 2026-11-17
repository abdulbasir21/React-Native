import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { generateClientId } from '../../src/lib/ids';
import { productRepository, type ProductDTO } from '../../src/repositories/productRepository';
import { purchaseRepository } from '../../src/repositories/purchaseRepository';
import { supplierRepository } from '../../src/repositories/supplierRepository';
import { lineSubtotal } from '../../src/shared/calculations';
import { NON_CREDIT_PAYMENT_METHODS, type NonCreditPaymentMethod } from '../../src/shared/enums';
import {
  cmpDecimal,
  dec,
  formatMoneyWithCurrency,
  sumMoney,
  validateQuantityForUnit,
} from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

interface DraftPurchaseLine {
  key: string;
  product: ProductDTO;
  quantity: string;
  unitCost: string;
}

export default function NewPurchaseScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const [idempotencyKey] = useState(() => generateClientId());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [lines, setLines] = useState<DraftPurchaseLine[]>([]);
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', { forPurchase: true }],
    queryFn: () => supplierRepository.list({ pageSize: 100 }),
  });

  const productsQuery = useQuery({
    queryKey: ['products', { forPurchase: true, search: productSearch }],
    queryFn: () => productRepository.list({ search: productSearch, pageSize: 50 }),
  });

  const computedTotal = useMemo(() => {
    const totals: string[] = [];
    for (const line of lines) {
      try {
        totals.push(lineSubtotal(line.quantity || '0', line.unitCost || '0'));
      } catch {
        // Incomplete or invalid line ignored in live sum until validated
      }
    }
    return sumMoney(totals);
  }, [lines]);

  const addProductLine = (product: ProductDTO) => {
    setLines((prev) => [
      ...prev,
      {
        key: generateClientId(),
        product,
        quantity: '1',
        unitCost: product.purchaseCost,
      },
    ]);
    setValidationError(null);
  };

  const updateLine = (key: string, field: 'quantity' | 'unitCost', value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      purchaseRepository.create({
        idempotencyKey,
        supplierId: selectedSupplierId,
        amountPaid: amountPaid.trim() || '0.00',
        ...(dec(amountPaid.trim() || '0').gt(0) ? { paymentMethod } : {}),
        note: note.trim() || undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity.trim(),
          unitCost: l.unitCost.trim(),
        })),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', selectedSupplierId] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      router.replace({ pathname: '/purchases/[id]', params: { id: created.id } });
    },
  });

  const handleConfirmPurchase = () => {
    if (!selectedSupplierId) {
      setValidationError('Select an active supplier first.');
      return;
    }
    if (lines.length === 0) {
      setValidationError('Add at least one product to purchase.');
      return;
    }
    for (const line of lines) {
      const check = validateQuantityForUnit(line.quantity, line.product.unit, false);
      if (!check.valid) {
        setValidationError(`${line.product.name}: ${check.reason ?? 'Invalid quantity'}`);
        return;
      }
      try {
        if (dec(line.unitCost).lt(0)) {
          setValidationError(`${line.product.name}: Unit cost must be >= 0`);
          return;
        }
      } catch {
        setValidationError(`${line.product.name}: Enter a valid unit cost`);
        return;
      }
    }
    try {
      const paidDec = dec(amountPaid.trim() || '0');
      if (paidDec.lt(0)) {
        setValidationError('Amount paid cannot be negative.');
        return;
      }
      if (paidDec.gt(dec(computedTotal))) {
        setValidationError('Amount paid cannot exceed purchase total.');
        return;
      }
    } catch {
      setValidationError('Enter a valid amount paid.');
      return;
    }

    setValidationError(null);
    createMutation.mutate();
  };

  if (suppliersQuery.isLoading || productsQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="New Purchase" />
        <LoadingState message="Loading suppliers and products..." />
      </SafeAreaView>
    );
  }

  if (suppliersQuery.isError || productsQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="New Purchase" />
        <ErrorState
          message="Could not load suppliers or products."
          onRetry={() => {
            void suppliersQuery.refetch();
            void productsQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  const activeSuppliers = suppliersQuery.data?.items ?? [];
  const activeProducts = productsQuery.data?.items ?? [];

  if (activeSuppliers.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="New Purchase" />
        <EmptyState
          icon="business-outline"
          title="No active suppliers"
          subtitle="Create a supplier before recording a stock purchase."
          actionLabel="Go to Suppliers"
          onAction={() => router.replace('/suppliers')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New Purchase" subtitle="Updates stock & weighted average cost" />

      <ScrollView contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 48 }}>
        {validationError || createMutation.isError ? (
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
              {validationError ?? extractApiErrorMessage(createMutation.error, 'Could not record purchase')}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>1. Supplier *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {activeSuppliers.map((sup) => {
              const active = selectedSupplierId === sup.id;
              return (
                <Pressable
                  key={sup.id}
                  onPress={() => setSelectedSupplierId(sup.id)}
                  style={{
                    minHeight: 42,
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
                      color: active ? colors.primary : colors.textPrimary,
                    }}
                  >
                    {sup.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>2. Add Products *</Text>
          <View
            style={{
              minHeight: layout.inputHeight,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderInput,
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Filter products to add..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {activeProducts.map((prod) => (
              <Pressable
                key={prod.id}
                onPress={() => addProductLine(prod)}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>+ {prod.name}</Text>
                <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                  Stock: {prod.quantityOnHand} {prod.unit}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {lines.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Purchase Items ({lines.length})</Text>
            {lines.map((line) => {
              let lineTotalLabel = formatMoneyWithCurrency('0', currency);
              try {
                lineTotalLabel = formatMoneyWithCurrency(
                  lineSubtotal(line.quantity || '0', line.unitCost || '0'),
                  currency,
                );
              } catch {
                lineTotalLabel = '--';
              }
              return (
                <View
                  key={line.key}
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
                    <Text style={{ ...typography.titleMd, color: colors.textPrimary, flex: 1 }}>
                      {line.product.name} ({line.product.unit})
                    </Text>
                    <Pressable
                      onPress={() => removeLine(line.key)}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.errorText} />
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Qty"
                        keyboardType="decimal-pad"
                        value={line.quantity}
                        onChangeText={(v) => updateLine(line.key, 'quantity', v)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Unit cost"
                        keyboardType="decimal-pad"
                        value={line.unitCost}
                        onChangeText={(v) => updateLine(line.key, 'unitCost', v)}
                      />
                    </View>
                  </View>

                  <Text style={{ ...typography.labelMd, color: colors.primary, textAlign: 'right' }}>
                    Line Total: {lineTotalLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

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
            <Text style={{ ...typography.titleMd, color: colors.textSecondary }}>Purchase Total</Text>
            <Text style={{ ...typography.currencyMd, color: colors.primary }}>
              {formatMoneyWithCurrency(computedTotal, currency)}
            </Text>
          </View>

          <FormField
            label="Amount paid now"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={amountPaid}
            onChangeText={setAmountPaid}
          />

          {cmpDecimal(amountPaid.trim() || '0', 0) > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>Payment method</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                  const active = paymentMethod === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setPaymentMethod(m)}
                      style={{
                        minHeight: 38,
                        paddingHorizontal: 12,
                        borderRadius: radii.md,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primarySoft : colors.surface,
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ ...typography.labelMd, color: active ? colors.primary : colors.textPrimary }}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <FormField
            label="Note (optional)"
            placeholder="Invoice # or remarks"
            value={note}
            onChangeText={setNote}
          />
        </View>

        <PrimaryButton
          title="Confirm Purchase"
          loading={createMutation.isPending}
          onPress={handleConfirmPurchase}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
