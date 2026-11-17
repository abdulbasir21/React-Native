import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { purchaseRepository } from '../../src/repositories/purchaseRepository';
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

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [payNote, setPayNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const purchaseQuery = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => purchaseRepository.getById(id),
    enabled: Boolean(id),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      purchaseRepository.payPurchase(id, {
        amount: payAmount,
        method: payMethod,
        note: payNote,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      if (purchaseQuery.data?.supplierId) {
        void queryClient.invalidateQueries({ queryKey: ['supplier', purchaseQuery.data.supplierId] });
      }
      setPayAmount('');
      setPayNote('');
    },
  });

  if (purchaseQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Purchase Details" />
        <LoadingState message="Loading purchase..." />
      </SafeAreaView>
    );
  }

  if (purchaseQuery.isError || !purchaseQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Purchase Details" />
        <ErrorState
          message={extractApiErrorMessage(purchaseQuery.error, 'Purchase not found')}
          onRetry={() => void purchaseQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const purchase = purchaseQuery.data;
  const statusStyle = paymentStatusColors[purchase.paymentStatus];
  const hasBalance = cmpDecimal(purchase.balanceDue, 0) > 0;

  const handlePaySubmit = () => {
    try {
      const d = dec(payAmount.trim());
      if (d.lte(0)) {
        setFormError('Payment amount must be greater than zero.');
        return;
      }
    } catch {
      setFormError('Enter a valid payment amount.');
      return;
    }
    setFormError(null);
    payMutation.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={purchase.supplierName ?? 'Purchase'}
        subtitle={new Date(purchase.occurredAt).toLocaleString()}
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
            <Text style={{ ...typography.currencyDisplay, color: colors.primary }}>
              {formatMoneyWithCurrency(purchase.total, currency)}
            </Text>
            <StatusPill label={purchase.paymentStatus} bg={statusStyle.bg} text={statusStyle.text} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Paid: {formatMoneyWithCurrency(purchase.amountPaid, currency)}
            </Text>
            <Text
              style={{
                ...typography.labelLg,
                color: hasBalance ? colors.errorText : colors.successText,
              }}
            >
              Balance: {formatMoneyWithCurrency(purchase.balanceDue, currency)}
            </Text>
          </View>

          {purchase.note ? (
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>Note: {purchase.note}</Text>
          ) : null}
        </View>

        {hasBalance ? (
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
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Record Payment</Text>

            {formError || payMutation.isError ? (
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                {formError ?? extractApiErrorMessage(payMutation.error, 'Payment failed')}
              </Text>
            ) : null}

            <FormField
              label={`Amount (max ${purchase.balanceDue})`}
              keyboardType="decimal-pad"
              placeholder={purchase.balanceDue}
              value={payAmount}
              onChangeText={setPayAmount}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                const active = payMethod === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
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

            <FormField
              label="Note (optional)"
              placeholder="Receipt reference"
              value={payNote}
              onChangeText={setPayNote}
            />

            <PrimaryButton
              title="Submit Payment"
              loading={payMutation.isPending}
              onPress={handlePaySubmit}
            />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Items</Text>
          {(purchase.items ?? []).map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  {item.productNameSnapshot}
                </Text>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                  {item.quantity} × {formatMoneyWithCurrency(item.unitCost, currency)}
                </Text>
              </View>
              <Text style={{ ...typography.titleMd, color: colors.primary }}>
                {formatMoneyWithCurrency(item.lineTotal, currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Payments</Text>
          {purchase.payments.length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>No payments recorded yet.</Text>
          ) : (
            purchase.payments.map((pay) => (
              <View
                key={pay.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>{pay.method}</Text>
                  <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                    {new Date(pay.paidAt).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ ...typography.titleMd, color: colors.successText }}>
                  {formatMoneyWithCurrency(pay.amount, currency)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
