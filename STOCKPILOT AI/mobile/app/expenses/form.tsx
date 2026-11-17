import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import {
  expenseFormSchema,
  expenseRepository,
  type ExpenseFormValues,
} from '../../src/repositories/expenseRepository';
import { EXPENSE_CATEGORIES, NON_CREDIT_PAYMENT_METHODS } from '../../src/shared/enums';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

function isoDayOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export default function ExpenseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const expenseQuery = useQuery({
    queryKey: ['expense', id],
    queryFn: () => expenseRepository.getById(id!),
    enabled: isEditing && Boolean(id),
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      title: '',
      category: 'RENT',
      amount: '',
      expenseDate: new Date().toISOString(),
      paymentMethod: 'CASH',
      description: '',
      reason: '',
    },
  });

  useEffect(() => {
    if (expenseQuery.data) {
      reset({
        title: expenseQuery.data.title,
        category: expenseQuery.data.category,
        amount: expenseQuery.data.amount,
        expenseDate: expenseQuery.data.expenseDate,
        paymentMethod: expenseQuery.data.paymentMethod,
        description: expenseQuery.data.description ?? '',
        reason: '',
      });
    }
  }, [expenseQuery.data, reset]);

  const selectedCategory = watch('category');
  const selectedMethod = watch('paymentMethod');

  const saveMutation = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      isEditing && id ? expenseRepository.update(id, values) : expenseRepository.create(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['expense', saved.id] });
      router.back();
    },
  });

  if (isEditing && expenseQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Expense" />
        <LoadingState message="Loading expense..." />
      </SafeAreaView>
    );
  }

  if (isEditing && expenseQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Expense" />
        <ErrorState
          message={extractApiErrorMessage(expenseQuery.error, 'Could not load expense')}
          onRetry={() => void expenseQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={isEditing ? 'Edit Expense' : 'Add Expense'} />

      <ScrollView contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 40 }}>
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
              {extractApiErrorMessage(saveMutation.error, 'Could not save expense')}
            </Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Title"
              required
              placeholder="e.g. Monthly shop rent"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.title?.message}
            />
          )}
        />

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Category *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EXPENSE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setValue('category', cat)}
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
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Controller
          control={control}
          name="amount"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Amount"
              required
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.amount?.message}
            />
          )}
        />

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Payment method *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NON_CREDIT_PAYMENT_METHODS.map((m) => {
              const active = selectedMethod === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setValue('paymentMethod', m)}
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

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Expense date (ISO UTC) *</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: 'Today', offset: 0 },
              { label: 'Yesterday', offset: -1 },
              { label: 'Tomorrow', offset: 1 },
            ].map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => setValue('expenseDate', isoDayOffset(preset.offset))}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 12,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.labelMd, color: colors.primary }}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
          <Controller
            control={control}
            name="expenseDate"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Timestamp"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.expenseDate?.message}
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Description (optional)"
              multiline
              placeholder="Receipt or bill details"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
            />
          )}
        />

        {isEditing ? (
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Edit reason (logged for audit)"
                placeholder="e.g. Corrected electricity bill amount"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        ) : null}

        <PrimaryButton
          title={isEditing ? 'Save Expense Changes' : 'Save Expense'}
          loading={saveMutation.isPending}
          onPress={() => void handleSubmit((v) => saveMutation.mutate(v))()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
