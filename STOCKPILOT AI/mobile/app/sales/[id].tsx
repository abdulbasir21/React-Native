import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { previewSaleReturn, validateCancelConfirmation } from '../../src/lib/saleReturnHelpers';
import { saleRepository } from '../../src/repositories/saleRepository';
import { NON_CREDIT_PAYMENT_METHODS, type NonCreditPaymentMethod } from '../../src/shared/enums';
import { cmpDecimal, dec, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import {
  colors,
  paymentStatusColors,
  radii,
  spacing,
  typography,
} from '../../src/theme/tokens';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [payNote, setPayNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnQtyMap, setReturnQtyMap] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnRefundMethod, setReturnRefundMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [returnApiError, setReturnApiError] = useState<string | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefundMethod, setCancelRefundMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [cancelApiError, setCancelApiError] = useState<string | null>(null);

  const saleQuery = useQuery({
    queryKey: ['sale', id],
    queryFn: () => saleRepository.getById(id),
    enabled: Boolean(id),
  });

  const invalidateSaleQueries = (customerId?: string | null) => {
    void queryClient.invalidateQueries({ queryKey: ['sale', id] });
    void queryClient.invalidateQueries({ queryKey: ['sale-receipt', id] });
    void queryClient.invalidateQueries({ queryKey: ['sales'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    if (customerId) {
      void queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      void queryClient.invalidateQueries({ queryKey: ['customer-sales', customerId] });
      void queryClient.invalidateQueries({ queryKey: ['customer-payments', customerId] });
    }
  };

  const payMutation = useMutation({
    mutationFn: () =>
      saleRepository.addPayment(id, {
        amount: payAmount,
        method: payMethod,
        note: payNote,
      }),
    onSuccess: (updated) => {
      invalidateSaleQueries(updated.customerId);
      setPayAmount('');
      setPayNote('');
    },
  });

  const sale = saleQuery.data;

  const returnPreview = useMemo(() => {
    if (!sale) return null;
    return previewSaleReturn(sale, returnQtyMap, returnReason);
  }, [sale, returnQtyMap, returnReason]);

  const cancelCheck = useMemo(() => {
    if (!sale) return null;
    return validateCancelConfirmation(sale, cancelReason);
  }, [sale, cancelReason]);

  const returnMutation = useMutation({
    mutationFn: () =>
      saleRepository.createReturn(id, {
        reason: returnReason,
        ...(returnPreview?.requiresRefundMethod ? { refundMethod: returnRefundMethod } : {}),
        items: (returnPreview?.selectedLines ?? []).map((l) => ({
          saleItemId: l.saleItemId,
          quantity: l.quantity,
        })),
      }),
    onSuccess: (res) => {
      invalidateSaleQueries(res.sale.customerId);
      setReturnModalOpen(false);
      setReturnQtyMap({});
      setReturnReason('');
      setReturnApiError(null);
    },
    onError: (err) => {
      setReturnApiError(extractApiErrorMessage(err, 'Return failed'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      saleRepository.cancel(id, {
        reason: cancelReason,
        ...(sale && cmpDecimal(sale.amountPaid, 0) > 0
          ? { refundMethod: cancelRefundMethod }
          : {}),
      }),
    onSuccess: (updated) => {
      invalidateSaleQueries(updated.customerId);
      setCancelModalOpen(false);
      setCancelReason('');
      setCancelApiError(null);
    },
    onError: (err) => {
      setCancelApiError(extractApiErrorMessage(err, 'Cancellation failed'));
    },
  });

  if (saleQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Sale Details" />
        <LoadingState message="Loading sale..." />
      </SafeAreaView>
    );
  }

  if (saleQuery.isError || !sale) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Sale Details" />
        <ErrorState
          message={extractApiErrorMessage(saleQuery.error, 'Sale not found')}
          onRetry={() => void saleQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const pStyle = paymentStatusColors[sale.paymentStatus];
  const canPay = sale.status === 'COMPLETED' && cmpDecimal(sale.balanceDue, 0) > 0;
  const hasReturns = (sale.returns?.length ?? 0) > 0 || cmpDecimal(sale.returnedValue, 0) > 0;
  const canReturn =
    sale.status === 'COMPLETED' &&
    (sale.items ?? []).some((i) => dec(i.quantity).minus(i.returnedQuantity ?? '0').gt(0));
  const canCancel = sale.status === 'COMPLETED' && !hasReturns;

  const handlePaySubmit = () => {
    try {
      const amt = dec(payAmount.trim());
      if (amt.lte(0)) {
        setFormError('Payment amount must be greater than zero.');
        return;
      }
      if (amt.gt(dec(sale.balanceDue))) {
        setFormError(`Amount cannot exceed balance due (${sale.balanceDue}).`);
        return;
      }
    } catch {
      setFormError('Enter a valid decimal amount.');
      return;
    }
    setFormError(null);
    payMutation.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={sale.receiptNo}
        subtitle={sale.customer?.name ?? 'Walk-in Customer'}
        rightAction={
          <Pressable
            onPress={() => router.push(`/sales/receipt/${sale.id}`)}
            style={{
              minHeight: 44,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={{ ...typography.labelLg, color: colors.primary }}>Receipt</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: 40,
        }}
      >
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
            <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>
              {new Date(sale.occurredAt).toLocaleString()}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {sale.status === 'CANCELLED' ? (
                <StatusPill label="CANCELLED" bg={colors.errorBg} text={colors.errorText} />
              ) : hasReturns ? (
                <StatusPill label="RETURNED" bg={colors.infoBg} text={colors.infoText} />
              ) : null}
              <StatusPill label={sale.paymentStatus} bg={pStyle.bg} text={pStyle.text} />
            </View>
          </View>

          {sale.status === 'CANCELLED' && sale.cancelReason ? (
            <View
              style={{
                backgroundColor: colors.errorBg,
                borderRadius: radii.md,
                padding: spacing.sm,
              }}
            >
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                Cancelled: {sale.cancelReason}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Subtotal</Text>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              {formatMoneyWithCurrency(sale.subtotal, currency)}
            </Text>
          </View>
          {cmpDecimal(sale.discountAmount, 0) > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Discount</Text>
              <Text style={{ ...typography.titleMd, color: colors.warningText }}>
                -{formatMoneyWithCurrency(sale.discountAmount, currency)}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Original Total</Text>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              {formatMoneyWithCurrency(sale.total, currency)}
            </Text>
          </View>
          {hasReturns ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodyMd, color: colors.infoText }}>Returned</Text>
              <Text style={{ ...typography.titleMd, color: colors.infoText }}>
                -{formatMoneyWithCurrency(sale.returnedValue, currency)}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Net Total</Text>
            <Text style={{ ...typography.currencyMd, color: colors.primary }}>
              {formatMoneyWithCurrency(sale.netTotal, currency)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Net Paid</Text>
            <Text style={{ ...typography.titleMd, color: colors.successText }}>
              {formatMoneyWithCurrency(sale.amountPaid, currency)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Balance Due</Text>
            <Text
              style={{
                ...typography.titleMd,
                color: cmpDecimal(sale.balanceDue, 0) > 0 ? colors.warningText : colors.textPrimary,
              }}
            >
              {formatMoneyWithCurrency(sale.balanceDue, currency)}
            </Text>
          </View>
        </View>

        {sale.status === 'COMPLETED' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {canReturn ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Return Items"
                  variant="secondary"
                  onPress={() => {
                    setReturnApiError(null);
                    setReturnModalOpen(true);
                  }}
                />
              </View>
            ) : null}
            {canCancel ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Cancel Sale"
                  variant="danger"
                  onPress={() => {
                    setCancelApiError(null);
                    setCancelModalOpen(true);
                  }}
                />
              </View>
            ) : null}
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
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
            Items ({sale.items?.length ?? 0})
          </Text>
          {(sale.items ?? []).map((item) => (
            <View
              key={item.id}
              style={{
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: colors.divider,
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  {item.productNameSnapshot}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                  {item.quantity} {item.unitSnapshot} ×{' '}
                  {formatMoneyWithCurrency(item.unitPrice, currency)}
                  {item.returnedQuantity && cmpDecimal(item.returnedQuantity, 0) > 0
                    ? ` • Returned: ${item.returnedQuantity}`
                    : ''}
                </Text>
              </View>
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                {formatMoneyWithCurrency(item.lineNet, currency)}
              </Text>
            </View>
          ))}
        </View>

        {(sale.returns?.length ?? 0) > 0 ? (
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
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              Returns ({sale.returns!.length})
            </Text>
            {sale.returns!.map((ret) => (
              <View
                key={ret.id}
                style={{
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                  gap: 2,
                }}
              >
                <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>{ret.reason}</Text>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                  {new Date(ret.occurredAt).toLocaleString()} • {ret.items.length}{' '}
                  {ret.items.length === 1 ? 'line' : 'lines'}
                </Text>
              </View>
            ))}
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
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
            Payments ({sale.payments.length})
          </Text>
          {sale.payments.length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              No payments recorded yet.
            </Text>
          ) : (
            sale.payments.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>
                    {p.kind} • {p.method}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    {new Date(p.paidAt).toLocaleString()}
                    {p.note ? ` • ${p.note}` : ''}
                  </Text>
                </View>
                <Text
                  style={{
                    ...typography.titleMd,
                    color: p.direction === 'OUT' ? colors.errorText : colors.successText,
                  }}
                >
                  {p.direction === 'OUT' ? '-' : '+'}
                  {formatMoneyWithCurrency(p.amount, currency)}
                </Text>
              </View>
            ))
          )}
        </View>

        {canPay ? (
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
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Record Payment</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                const active = payMethod === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: 12,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.borderInput,
                      backgroundColor: active ? colors.primarySoft : colors.background,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        ...typography.labelMd,
                        color: active ? colors.primary : colors.textSecondary,
                      }}
                    >
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <FormField
              label={`Amount (Balance ${formatMoneyWithCurrency(sale.balanceDue, currency)})`}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder={sale.balanceDue}
              error={
                formError ??
                (payMutation.isError
                  ? extractApiErrorMessage(payMutation.error, 'Payment failed')
                  : undefined)
              }
            />
            <FormField
              label="Note (optional)"
              value={payNote}
              onChangeText={setPayNote}
              placeholder="Cash or Easypaisa ref..."
            />
            <PrimaryButton
              title="Save Payment"
              loading={payMutation.isPending}
              onPress={handlePaySubmit}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Return Items Modal */}
      <Modal visible={returnModalOpen} animationType="slide" transparent>
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
              maxHeight: '88%',
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>Return Items</Text>
              <Pressable
                onPress={() => setReturnModalOpen(false)}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              {(sale.items ?? []).map((item) => {
                const remaining = dec(item.quantity).minus(item.returnedQuantity ?? '0');
                if (remaining.lte(0)) return null;
                return (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: colors.background,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                        {item.productNameSnapshot}
                      </Text>
                      <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                        Returnable: {remaining.toString()} {item.unitSnapshot}
                      </Text>
                    </View>
                    <TextInput
                      value={returnQtyMap[item.id] ?? ''}
                      onChangeText={(val) =>
                        setReturnQtyMap((prev) => ({ ...prev, [item.id]: val }))
                      }
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      style={{
                        minWidth: 72,
                        minHeight: 44,
                        borderRadius: radii.md,
                        borderWidth: 1,
                        borderColor: colors.borderInput,
                        backgroundColor: colors.surface,
                        textAlign: 'center',
                        color: colors.textPrimary,
                        paddingHorizontal: 8,
                      }}
                    />
                  </View>
                );
              })}

              <FormField
                label="Return Reason"
                value={returnReason}
                onChangeText={setReturnReason}
                placeholder="Defective, wrong item, customer exchange..."
              />

              {returnPreview && returnPreview.valid ? (
                <View
                  style={{
                    backgroundColor: colors.infoBg,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    gap: 4,
                  }}
                >
                  <Text style={{ ...typography.labelLg, color: colors.infoText }}>
                    Return Value: {formatMoneyWithCurrency(returnPreview.totalRefundValue, currency)}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.infoText }}>
                    {returnPreview.requiresRefundMethod
                      ? `Cash refund due: ${formatMoneyWithCurrency(returnPreview.excessCashRefund, currency)}`
                      : 'Reduces balance due (no cash refund required).'}
                  </Text>
                </View>
              ) : null}

              {returnPreview?.requiresRefundMethod ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                    Refund Method
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                      const active = returnRefundMethod === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setReturnRefundMethod(m)}
                          style={{
                            minHeight: 40,
                            paddingHorizontal: 12,
                            borderRadius: radii.pill,
                            borderWidth: 1,
                            borderColor: active ? colors.primary : colors.borderInput,
                            backgroundColor: active ? colors.primarySoft : colors.background,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              ...typography.labelMd,
                              color: active ? colors.primary : colors.textSecondary,
                            }}
                          >
                            {m}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {returnPreview && !returnPreview.valid && returnPreview.error ? (
                <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                  {returnPreview.error}
                </Text>
              ) : null}
              {returnApiError ? (
                <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                  {returnApiError}
                </Text>
              ) : null}
            </ScrollView>

            <PrimaryButton
              title="Confirm Return"
              loading={returnMutation.isPending}
              disabled={!returnPreview?.valid}
              onPress={() => {
                setReturnApiError(null);
                returnMutation.mutate();
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Cancel Sale Confirmation Modal */}
      <Modal visible={cancelModalOpen} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(16, 24, 40, 0.5)',
            justifyContent: 'center',
            padding: spacing.md,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.xl,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.titleLg, color: colors.errorText }}>Cancel Sale</Text>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              This permanently cancels {sale.receiptNo}, restores all sold stock, and{' '}
              {cmpDecimal(sale.amountPaid, 0) > 0
                ? `refunds ${formatMoneyWithCurrency(sale.amountPaid, currency)}.`
                : 'clears any remaining balance.'}
            </Text>

            <FormField
              label="Cancellation Reason"
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Customer cancelled order, billing mistake..."
              error={cancelCheck && !cancelCheck.allowed && cancelReason ? cancelCheck.error ?? undefined : undefined}
            />

            {cmpDecimal(sale.amountPaid, 0) > 0 ? (
              <View style={{ gap: 6 }}>
                <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>Refund Method</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                    const active = cancelRefundMethod === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setCancelRefundMethod(m)}
                        style={{
                          minHeight: 40,
                          paddingHorizontal: 12,
                          borderRadius: radii.pill,
                          borderWidth: 1,
                          borderColor: active ? colors.primary : colors.borderInput,
                          backgroundColor: active ? colors.primarySoft : colors.background,
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            ...typography.labelMd,
                            color: active ? colors.primary : colors.textSecondary,
                          }}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {cancelApiError ? (
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>{cancelApiError}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Keep Sale"
                  variant="secondary"
                  onPress={() => setCancelModalOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Confirm Cancel"
                  variant="danger"
                  loading={cancelMutation.isPending}
                  disabled={!cancelCheck?.allowed}
                  onPress={() => {
                    setCancelApiError(null);
                    cancelMutation.mutate();
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
