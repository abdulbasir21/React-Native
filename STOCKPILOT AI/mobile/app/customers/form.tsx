import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import {
  customerFormSchema,
  customerRepository,
  type CustomerFormValues,
} from '../../src/repositories/customerRepository';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerRepository.getById(id!),
    enabled: isEditing && Boolean(id),
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { name: '', phone: '' },
  });

  useEffect(() => {
    if (customerQuery.data) {
      reset({
        name: customerQuery.data.name,
        phone: customerQuery.data.phone ?? '',
      });
    }
  }, [customerQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: CustomerFormValues) =>
      isEditing && id ? customerRepository.update(id, values) : customerRepository.create(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer', saved.id] });
      router.back();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => customerRepository.archive(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer', id] });
      router.replace('/customers');
    },
  });

  const confirmArchive = () => {
    if (!id) return;
    Alert.alert(
      'Archive customer?',
      'Archived customers keep past sales history, but cannot be assigned to new credit sales.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate() },
      ],
    );
  };

  if (isEditing && customerQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Customer" />
        <LoadingState message="Loading customer..." />
      </SafeAreaView>
    );
  }

  if (isEditing && customerQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit Customer" />
        <ErrorState
          message={extractApiErrorMessage(customerQuery.error, 'Could not load customer')}
          onRetry={() => void customerQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={isEditing ? 'Edit Customer' : 'Add Customer'} />

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
              {extractApiErrorMessage(saveMutation.error, 'Failed to save customer')}
            </Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Customer name"
              required
              placeholder="e.g. Bilal Ahmed"
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
              label="Phone (optional)"
              keyboardType="phone-pad"
              placeholder="0300-1234567"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.phone?.message}
            />
          )}
        />

        <PrimaryButton
          title={isEditing ? 'Save Changes' : 'Add Customer'}
          loading={saveMutation.isPending}
          onPress={() => void handleSubmit((v) => saveMutation.mutate(v))()}
        />

        {isEditing && !customerQuery.data?.archivedAt ? (
          <PrimaryButton
            title="Archive Customer"
            variant="danger"
            loading={archiveMutation.isPending}
            onPress={confirmArchive}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
