import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import { StatusPill } from '../../src/components/StatusPill';
import {
  paySupplierSchema,
  supplierFormSchema,
  supplierRepository,
  type PaySupplierValues,
  type SupplierFormValues,
} from '../../src/repositories/supplierRepository';
import { NON_CREDIT_PAYMENT_METHODS } from '../../src/shared/enums';
import { cmpDecimal, formatMoneyWithCurrency } from '../../src/shared/money';
import { useSessionStore } from '../../src/stores/sessionStore';
import {
  colors,
  paymentStatusColors,
  radii,
  spacing,
  typography,
} from '../../src/theme/tokens';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');
  const [showPayForm, setShowPayForm] = useState(false);

  const supplierQuery = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => supplierRepository.getById(id),
    enabled: Boolean(id),
  });

  const purchasesQuery = useQuery({
    queryKey: ['supplier-purchases', id],
    queryFn: () => supplierRepository.listPurchases(id, 1, 20),
    enabled: Boolean(id),
  });

  const paymentsQuery = useQuery({
    queryKey: ['supplier-payments', id],
    queryFn: () => supplierRepository.listPayments(id, 1, 30),
    enabled: Boolean(id),
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: { name: '', phone: '', address: '', notes: '' },
  });

  const payForm = useForm<PaySupplierValues>({
    resolver: zodResolver(paySupplierSchema),
    defaultValues: { amount: '', method: 'CASH', note: '' },
  });

  useEffect(() => {
    if (supplierQuery.data) {
      reset({
        name: supplierQuery.data.name,
        phone: supplierQuery.data.phone ?? '',
        address: supplierQuery.data.address ?? '',
        notes: supplierQuery.data.notes ?? '',
      });
    }
  }, [supplierQuery.data, reset]);

  const updateMutation = useMutation({
    mutationFn: (values: SupplierFormValues) => supplierRepository.update(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      router.back();
    },
  });

  const payMutation = useMutation({
    mutationFn: (values: PaySupplierValues) =>
      supplierRepository.pay(id, {
        amount: values.amount,
        method: values.method,
        note: values.note,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-purchases', id] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-payments', id] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      payForm.reset({ amount: '', method: 'CASH', note: '' });
      setShowPayForm(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => supplierRepository.archive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      router.replace('/suppliers');
    },
  });

  const confirmArchive = () => {
    Alert.alert(
      'Archive supplier?',
      'Archived suppliers keep past purchase records and balance, but cannot receive new purchases.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate() },
      ],
    );
  };

  if (supplierQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Supplier Details" />
        <LoadingState message="Loading supplier..." />
      </SafeAreaView>
    );
  }

  if (supplierQuery.isError || !supplierQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Supplier Details" />
        <ErrorState
          message={extractApiErrorMessage(supplierQuery.error, 'Supplier not found')}
          onRetry={() => void supplierQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const supplier = supplierQuery.data;
  const hasPayable = cmpDecimal(supplier.payableBalance, 0) > 0;
  const payMethodSelected = payForm.watch('method');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={supplier.name} subtitle="Balance, purchases & settings" />

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
          <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Payable balance</Text>
          <Text
            style={{
              ...typography.currencyDisplay,
              color: hasPayable ? colors.errorText : colors.successText,
            }}
          >
            {formatMoneyWithCurrency(supplier.payableBalance, currency)}
          </Text>

          {hasPayable ? (
            <PrimaryButton
              title={showPayForm ? 'Hide Payment Form' : 'Pay Supplier (Oldest First)'}
              onPress={() => setShowPayForm((prev) => !prev)}
            />
          ) : null}
        </View>

        {showPayForm ? (
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
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Pay Supplier</Text>

            {payMutation.isError ? (
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                {extractApiErrorMessage(payMutation.error, 'Payment failed')}
              </Text>
            ) : null}

            <Controller
              control={payForm.control}
              name="amount"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label={`Amount (max ${supplier.payableBalance})`}
                  required
                  keyboardType="decimal-pad"
                  placeholder={supplier.payableBalance}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={payForm.formState.errors.amount?.message}
                />
              )}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {NON_CREDIT_PAYMENT_METHODS.map((m) => {
                const active = payMethodSelected === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => payForm.setValue('method', m)}
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

            <Controller
              control={payForm.control}
              name="note"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Note (optional)"
                  placeholder="Receipt or transfer ref"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <PrimaryButton
              title="Record Supplier Payment"
              loading={payMutation.isPending}
              onPress={() => void payForm.handleSubmit((v) => payMutation.mutate(v))()}
            />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Supplier Purchases</Text>
          {(purchasesQuery.data?.items ?? []).length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>No purchases yet.</Text>
          ) : (
            (purchasesQuery.data?.items ?? []).map((p) => {
              const st = paymentStatusColors[p.paymentStatus];
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: '/purchases/[id]', params: { id: p.id } })}
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
                    <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                      {formatMoneyWithCurrency(p.total, currency)}
                    </Text>
                    <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                      Due: {formatMoneyWithCurrency(p.balanceDue, currency)} ·{' '}
                      {new Date(p.occurredAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <StatusPill label={p.paymentStatus} bg={st.bg} text={st.text} />
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Payment History</Text>
          {(paymentsQuery.data?.items ?? []).length === 0 ? (
            <Text style={{ ...typography.bodySm, color: colors.textMuted }}>No payments recorded yet.</Text>
          ) : (
            (paymentsQuery.data?.items ?? []).map((pay) => (
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

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Edit Supplier Details</Text>
          {updateMutation.isError ? (
            <Text style={{ ...typography.bodySm, color: colors.errorText }}>
              {extractApiErrorMessage(updateMutation.error, 'Failed to update supplier')}
            </Text>
          ) : null}

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Supplier name"
                required
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Phone"
                keyboardType="phone-pad"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="address"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Address"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.address?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Notes"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.notes?.message}
              />
            )}
          />

          <PrimaryButton
            title="Save Changes"
            loading={updateMutation.isPending}
            onPress={() => void handleSubmit((v) => updateMutation.mutate(v))()}
          />

          {!supplier.archivedAt ? (
            <PrimaryButton
              title="Archive Supplier"
              variant="danger"
              loading={archiveMutation.isPending}
              onPress={confirmArchive}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
