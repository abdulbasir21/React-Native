import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/ScreenStates';
import {
  supplierFormSchema,
  supplierRepository,
  type SupplierDTO,
  type SupplierFormValues,
} from '../../src/repositories/supplierRepository';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

export default function SuppliersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', { search }],
    queryFn: () => supplierRepository.list({ search, pageSize: 100 }),
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

  const createMutation = useMutation({
    mutationFn: (values: SupplierFormValues) => supplierRepository.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      reset({ name: '', phone: '', address: '', notes: '' });
      setShowAddForm(false);
    },
  });

  const items = suppliersQuery.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Suppliers"
        subtitle="Manage vendors & balances"
        rightAction={
          <Pressable
            onPress={() => setShowAddForm((prev) => !prev)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: radii.md,
              backgroundColor: colors.primary,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.white }}>
              {showAddForm ? 'Close' : '+ Add'}
            </Text>
          </Pressable>
        }
      />

      <View
        style={{
          paddingHorizontal: spacing.screenPadding,
          paddingVertical: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            minHeight: layout.inputHeight,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.borderInput,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search supplier name or phone..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15 }}
          />
        </View>

        {showAddForm ? (
          <View
            style={{
              padding: spacing.md,
              backgroundColor: colors.background,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>New Supplier</Text>

            {createMutation.isError ? (
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                {extractApiErrorMessage(createMutation.error, 'Could not save supplier')}
              </Text>
            ) : null}

            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Supplier name"
                  required
                  placeholder="e.g. Metro Mobile Distributors"
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
                  placeholder="0300-1234567"
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
                  placeholder="Optional"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.address?.message}
                />
              )}
            />

            <PrimaryButton
              title="Save Supplier"
              loading={createMutation.isPending}
              onPress={() => void handleSubmit((v) => createMutation.mutate(v))()}
            />
          </View>
        ) : null}
      </View>

      {suppliersQuery.isLoading ? (
        <LoadingState message="Loading suppliers..." />
      ) : suppliersQuery.isError ? (
        <ErrorState
          message={extractApiErrorMessage(suppliersQuery.error, 'Could not load suppliers')}
          onRetry={() => void suppliersQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No suppliers yet"
          subtitle="Add wholesalers or distributors so you can record stock purchases."
          actionLabel="Add Supplier"
          onAction={() => setShowAddForm(true)}
        />
      ) : (
        <FlatList<SupplierDTO>
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.sm }}
          refreshing={suppliersQuery.isRefetching}
          onRefresh={() => void suppliersQuery.refetch()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/suppliers/[id]', params: { id: item.id } })}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{item.name}</Text>
                {item.phone ? (
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>{item.phone}</Text>
                ) : null}
                {item.address ? (
                  <Text style={{ ...typography.bodySm, color: colors.textMuted }} numberOfLines={1}>
                    {item.address}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
