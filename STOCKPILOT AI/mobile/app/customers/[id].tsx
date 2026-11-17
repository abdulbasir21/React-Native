import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import { customerRepository } from '../../src/repositories/customerRepository';
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

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<NonCreditPaymentMethod>('CASH');
  const [payNote, setPayNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastAllocationNote, setLastAllocationNote] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerRepository.getById(id),
    enabled: Boolean(id),
  });

  const salesQuery = useQuery({
    queryKey: ['customer-sales', id],
    queryFn: () => customerRepository.listSales(id),
    enabled: Boolean(id),
  });

  const paymentsQuery = useQuery({
    queryKey: ['customer-payments', id],
    queryFn: () => customerRepository.listPayments(id),
    enabled: Boolean(id),
  });

  const openBalanceCount =
    salesQuery.data?.filter((s) => s.status === 'COMPLETED' && cmpDecimal(s.balanceDue, 0) > 0)
      .length ?? 0;

  const receiveMutation = useMutation({
    mutationFn: () =>
      customerRepository.receivePayment(id, {
        amount: payAmount,
        method: payMethod,
        note: payNote,
        allocationCount: Math.max(openBalanceCount, 1),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['customer', id] });
      void queryClient.invalidateQueries({ queryKey: ['customer-sales', id] });
      void queryClient.invalidateQueries({ queryKey: ['customer-payments', id] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      setPayAmount('');
      setPayNote('');
      setLastAllocationNote(
        `Applied ${formatMoneyWithCurrency(res.amountApplied, currency)} across ${res.allocations.length} ${res.allocations.length === 1 ? 'sale' : 'sales'}.`,
      );
    },
  });

  if (customerQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Customer" />
        <LoadingState message="Loading customer..." />
      </SafeAreaView>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Customer" />
        <ErrorState
          message={extractApiErrorMessage(customerQuery.error, 'Customer not found')}
          onRetry={() => void customerQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const customer = customerQuery.data;
  const hasBalance = cmpDecimal(customer.outstandingBalance, 0) > 0;
  const sales = salesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const handleReceivePayment = () => {
    try {
      const amt = dec(payAmount.trim());
      if (amt.lte(0)) {
        setFormError('Amount must be greater than 0.');
        return;
      }
      if (amt.gt(dec(customer.outstandingBalance))) {
        setFormError(`Amount cannot exceed balance (${customer.outstandingBalance}).`);
        return;
      }
    } catch {
      setFormError('Enter a valid decimal amount.');
      return;
    }
    setFormError(null);
    receiveMutation.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={customer.name}
        subtitle={customer.phone || 'No phone number'}
        rightAction={
          <Pressable
            onPress={() => router.push(`/customers/form?id=${customer.id}`)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderInput,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Edit</Text>
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
            backgroundColor: hasBalance ? colors.primaryDark : colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: hasBalance ? colors.primaryDark : colors.border,
            padding: spacing.md,
            gap: 4,
          }}
        >
          <Text
            style={{
              ...typography.labelMd,
              color: hasBalance ? colors.primaryFixed : colors.textSecondary,
            }}
          >
            Outstanding Balance
          </Text>
          <Text
            style={{
              ...typography.currencyDisplay,
              color: hasBalance ? colors.white : colors.successText,
            }}
          >
            {formatMoneyWithCurrency(customer.outstandingBalance, currency)}
          </Text>
          {customer.archivedAt ? (
            <StatusPill label="ARCHIVED" bg={colors.divider} text={colors.textSecondary} />
          ) : null}
        </View>

        {lastAllocationNote ? (
          <View
            style={{
              backgroundColor: colors.successBg,
              borderRadius: radii.md,
              padding: spacing.md,
            }}
          >
            <Text style={{ ...typography.bodyMd, color: colors.successText }}>
              {lastAllocationNote}
            </Text>
          </View>
        ) : null}

        {hasBalance ? (
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
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Receive Payment</Text>
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              Automatically allocates to oldest unpaid bills first.
            </Text>
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
              label={`Amount (${currency})`}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder={customer.outstandingBalance}
              error={
                formError ??
                (receiveMutation.isError
                  ? extractApiErrorMessage(receiveMutation.error, 'Payment failed')
                  : undefined)
              }
            />
            <FormField
              label="Note (optional)"
              value={payNote}
              onChangeText={setPayNote}
              placeholder="Cash or transfer reference..."
            />
            <PrimaryButton
              title="Receive Payment"
              loading={receiveMutation.isPending}
              onPress={handleReceivePayment}
            />
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
            Sales ({sales.length})
          </Text>
          {sales.length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              No sales recorded for this customer yet.
            </Text>
          ) : (
            sales.map((s) => {
              const pStyle = paymentStatusColors[s.paymentStatus];
              return (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/sales/${s.id}`)}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.divider,
                    gap: 4,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                      {s.receiptNo}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {s.status === 'CANCELLED' ? (
                        <StatusPill label="CANCELLED" bg={colors.errorBg} text={colors.errorText} />
                      ) : cmpDecimal(s.returnedValue, 0) > 0 ? (
                        <StatusPill label="RETURNED" bg={colors.infoBg} text={colors.infoText} />
                      ) : null}
                      <StatusPill label={s.paymentStatus} bg={pStyle.bg} text={pStyle.text} />
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                      {new Date(s.occurredAt).toLocaleDateString()}
                    </Text>
                    <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>
                      Net {formatMoneyWithCurrency(s.netTotal, currency)}
                      {cmpDecimal(s.balanceDue, 0) > 0
                        ? ` • Due ${formatMoneyWithCurrency(s.balanceDue, currency)}`
                        : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
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
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
            Payment History ({payments.length})
          </Text>
          {payments.length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
              No payments yet.
            </Text>
          ) : (
            payments.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                }}
              >
                <View>
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
      </ScrollView>
    </SafeAreaView>
  );
}
