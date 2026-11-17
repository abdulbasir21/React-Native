import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/ScreenStates';
import { customerRepository, type CustomerDTO } from '../../src/repositories/customerRepository';
import { saleRepository } from '../../src/repositories/saleRepository';
import { PAYMENT_METHODS, type PaymentMethod } from '../../src/shared/enums';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import {
  buildDiscountInput,
  computeCartSummary,
  usePosCartStore,
} from '../../src/stores/posCartStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  EASYPAISA: 'Easypaisa',
  JAZZCASH: 'JazzCash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  CREDIT: 'Credit',
};

export default function PosCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const items = usePosCartStore((s) => s.items);
  const discountType = usePosCartStore((s) => s.discountType);
  const discountValue = usePosCartStore((s) => s.discountValue);
  const customerId = usePosCartStore((s) => s.customerId);
  const note = usePosCartStore((s) => s.note);
  const paymentMethod = usePosCartStore((s) => s.paymentMethod);
  const tenderedAmount = usePosCartStore((s) => s.tenderedAmount);

  const setPaymentMethod = usePosCartStore((s) => s.setPaymentMethod);
  const setTenderedAmount = usePosCartStore((s) => s.setTenderedAmount);
  const setCustomerId = usePosCartStore((s) => s.setCustomerId);
  const reset = usePosCartStore((s) => s.reset);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      computeCartSummary({
        items,
        discountType,
        discountValue,
        customerId,
        note,
        paymentMethod,
        tenderedAmount,
      }),
    [items, discountType, discountValue, customerId, note, paymentMethod, tenderedAmount],
  );

  const didPrefillTendered = useRef(false);

  // Prefill exact total once on entering checkout for non-CREDIT when blank
  useEffect(() => {
    if (
      !didPrefillTendered.current &&
      paymentMethod !== 'CREDIT' &&
      !tenderedAmount &&
      cmpDecimal(summary.total, 0) > 0
    ) {
      didPrefillTendered.current = true;
      setTenderedAmount(summary.total);
    }
  }, [paymentMethod, setTenderedAmount, summary.total, tenderedAmount]);

  const customersQuery = useQuery({
    queryKey: ['customers', { search: customerSearch }],
    queryFn: () => customerRepository.list({ search: customerSearch, pageSize: 100 }),
  });

  const allCustomers = customersQuery.data?.items ?? [];
  const selectedCustomer = allCustomers.find((c) => c.id === customerId) ?? null;

  const createCustomerMutation = useMutation({
    mutationFn: () =>
      customerRepository.create({
        name: newCustomerName,
        phone: newCustomerPhone,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setCustomerId(created.id);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setCustomerFormError(null);
      setCustomerModalOpen(false);
    },
    onError: (err) => {
      setCustomerFormError(extractApiErrorMessage(err, 'Could not add customer'));
    },
  });

  const completeSaleMutation = useMutation({
    mutationFn: async () => {
      const { discount } = buildDiscountInput(discountType, discountValue);
      return saleRepository.create({
        customerId,
        note,
        discount,
        paymentMethod,
        amountReceived: summary.amountReceivedForServer,
        items: items.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPriceOverride,
        })),
      });
    },
    onSuccess: (sale) => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      reset();
      router.replace(`/sales/receipt/${sale.id}`);
    },
    onError: (err) => {
      setSubmitError(extractApiErrorMessage(err, 'Could not complete sale'));
    },
  });

  if (summary.lines.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Checkout" />
        <EmptyState
          icon="cart-outline"
          title="No items to checkout"
          subtitle="Return to POS Sale and tap products to add them."
          actionLabel="Go to POS Sale"
          onAction={() => router.replace('/(tabs)/sales')}
        />
      </SafeAreaView>
    );
  }

  const missingRequiredCustomer = summary.requiresCustomer && !customerId;
  const canSubmit =
    !summary.hasInvalidLine &&
    !summary.discountError &&
    !summary.paymentError &&
    !missingRequiredCustomer &&
    !completeSaleMutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Checkout" subtitle="Payment & customer details" />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: 120,
        }}
      >
        <View
          style={{
            backgroundColor: colors.primaryDark,
            borderRadius: radii.lg,
            padding: spacing.md,
            gap: 4,
          }}
        >
          <Text style={{ ...typography.labelMd, color: colors.primaryFixed }}>Amount Payable</Text>
          <Text style={{ ...typography.currencyDisplay, color: colors.white }}>
            {formatMoneyWithCurrency(summary.total, currency)}
          </Text>
          <Text style={{ ...typography.bodySm, color: colors.primaryFixed }}>
            {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'} • Subtotal{' '}
            {formatMoneyWithCurrency(summary.subtotal, currency)}
            {cmpDecimal(summary.discountAmount, 0) > 0
              ? ` • Discount -${formatMoneyWithCurrency(summary.discountAmount, currency)}`
              : ''}
          </Text>
        </View>

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
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Payment Method</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {PAYMENT_METHODS.map((method) => {
              const active = paymentMethod === method;
              return (
                <Pressable
                  key={method}
                  onPress={() => {
                    setPaymentMethod(method);
                    if (method !== 'CREDIT' && !tenderedAmount && cmpDecimal(summary.total, 0) > 0) {
                      setTenderedAmount(summary.total);
                    }
                  }}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 14,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.borderInput,
                    backgroundColor: active ? colors.primarySoft : colors.background,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...typography.labelLg,
                      color: active ? colors.primary : colors.textPrimary,
                    }}
                  >
                    {METHOD_LABELS[method]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {paymentMethod !== 'CREDIT' ? (
            <View style={{ gap: spacing.sm, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>
                  Amount Received
                </Text>
                <Pressable
                  onPress={() => setTenderedAmount(summary.total)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 10,
                    borderRadius: radii.pill,
                    backgroundColor: colors.primarySoft,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.primary }}>
                    Exact ({formatMoneyWithCurrency(summary.total, currency)})
                  </Text>
                </Pressable>
              </View>
              <FormField
                label=""
                value={tenderedAmount}
                onChangeText={setTenderedAmount}
                keyboardType="decimal-pad"
                placeholder={summary.total}
                error={summary.paymentError ?? undefined}
              />
            </View>
          ) : (
            <Text style={{ ...typography.bodySm, color: colors.warningText }}>
              Full credit sale: Rs 0.00 paid now. A customer account is required.
            </Text>
          )}
        </View>

        {cmpDecimal(summary.changeDue, 0) > 0 ? (
          <View
            style={{
              backgroundColor: colors.successBg,
              borderRadius: radii.lg,
              padding: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.successText }}>
              Change Due to Customer
            </Text>
            <Text style={{ ...typography.currencyMd, color: colors.successText }}>
              {formatMoneyWithCurrency(summary.changeDue, currency)}
            </Text>
          </View>
        ) : null}

        {cmpDecimal(summary.balanceDue, 0) > 0 ? (
          <View
            style={{
              backgroundColor: colors.warningBg,
              borderRadius: radii.lg,
              padding: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.titleMd, color: colors.warningText }}>
                Credit / Balance Due
              </Text>
              <Text style={{ ...typography.bodySm, color: colors.warningText }}>
                Added to customer balance (customer required)
              </Text>
            </View>
            <Text style={{ ...typography.currencyMd, color: colors.warningText }}>
              {formatMoneyWithCurrency(summary.balanceDue, currency)}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: missingRequiredCustomer ? colors.errorBorder : colors.border,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Customer</Text>
            {summary.requiresCustomer ? (
              <Text style={{ ...typography.labelMd, color: colors.errorText }}>Required</Text>
            ) : (
              <Text style={{ ...typography.labelMd, color: colors.textMuted }}>Optional</Text>
            )}
          </View>

          <Pressable
            onPress={() => setCustomerModalOpen(true)}
            style={{
              minHeight: 48,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderInput,
              backgroundColor: colors.background,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                ...typography.bodyMd,
                color: selectedCustomer ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {selectedCustomer
                ? `${selectedCustomer.name}${selectedCustomer.phone ? ` (${selectedCustomer.phone})` : ''}`
                : 'Walk-in Customer'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>

          {missingRequiredCustomer ? (
            <Text style={{ ...typography.bodySm, color: colors.errorText }}>
              Select or add a customer before completing a credit or partial payment sale.
            </Text>
          ) : null}
        </View>

        {submitError ? (
          <View
            style={{
              backgroundColor: colors.errorBg,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.errorBorder,
              padding: spacing.md,
            }}
          >
            <Text style={{ ...typography.bodyMd, color: colors.errorText }}>{submitError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          padding: spacing.md,
        }}
      >
        <PrimaryButton
          title="Complete Sale"
          loading={completeSaleMutation.isPending}
          disabled={!canSubmit}
          onPress={() => {
            setSubmitError(null);
            completeSaleMutation.mutate();
          }}
        />
      </View>

      <Modal visible={customerModalOpen} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(16, 24, 40, 0.45)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              maxHeight: '85%',
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>Select Customer</Text>
              <Pressable
                onPress={() => setCustomerModalOpen(false)}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            <FormField
              label="Search"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search name or phone..."
            />

            <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 8 }}>
              {!summary.requiresCustomer ? (
                <Pressable
                  onPress={() => {
                    setCustomerId(null);
                    setCustomerModalOpen(false);
                  }}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 12,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: customerId === null ? colors.primary : colors.border,
                    backgroundColor: customerId === null ? colors.primarySoft : colors.background,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    Walk-in Customer
                  </Text>
                </Pressable>
              ) : null}

              {allCustomers.map((c: CustomerDTO) => {
                const selected = c.id === customerId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCustomerId(c.id);
                      setCustomerModalOpen(false);
                    }}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primarySoft : colors.background,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View>
                      <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{c.name}</Text>
                      <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                        {c.phone || 'No phone'}
                      </Text>
                    </View>
                    {cmpDecimal(c.outstandingBalance ?? '0', 0) > 0 ? (
                      <Text style={{ ...typography.labelMd, color: colors.warningText }}>
                        Due {formatMoneyWithCurrency(c.outstandingBalance, currency)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.divider,
                paddingTop: spacing.sm,
                gap: spacing.sm,
              }}
            >
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>
                Quick Add New Customer
              </Text>
              <FormField
                label="Customer Name"
                value={newCustomerName}
                onChangeText={setNewCustomerName}
                placeholder="e.g. Tariq Traders"
                error={customerFormError ?? undefined}
              />
              <FormField
                label="Phone (optional)"
                value={newCustomerPhone}
                onChangeText={setNewCustomerPhone}
                keyboardType="phone-pad"
                placeholder="0300-1234567"
              />
              <PrimaryButton
                title="Add & Select Customer"
                loading={createCustomerMutation.isPending}
                onPress={() => {
                  if (!newCustomerName.trim()) {
                    setCustomerFormError('Customer name is required');
                    return;
                  }
                  createCustomerMutation.mutate();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
