import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SHOP_TYPE_LABELS } from '../../src/api/authApi';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/ScreenStates';
import {
  shopRepository,
  shopSettingsSchema,
  type ShopSettingsValues,
} from '../../src/repositories/shopRepository';
import { SHOP_TYPES, type ShopType } from '../../src/shared/enums';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

const PRESET_CURRENCIES = ['PKR', 'USD', 'AED', 'SAR', 'GBP'] as const;
const PRESET_TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'UTC'] as const;

export default function ShopSettingsScreen() {
  const router = useRouter();
  const updateShopInStore = useSessionStore((s) => s.updateShop);

  const shopQuery = useQuery({
    queryKey: ['shop'],
    queryFn: shopRepository.get,
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ShopSettingsValues>({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: {
      name: '',
      type: 'MOBILE_ACCESSORIES',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      address: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (shopQuery.data) {
      reset({
        name: shopQuery.data.name,
        type: (SHOP_TYPES.includes(shopQuery.data.type as ShopType)
          ? shopQuery.data.type
          : 'OTHER') as ShopType,
        currency: shopQuery.data.currency,
        timezone: shopQuery.data.timezone,
        address: shopQuery.data.address ?? '',
        phone: shopQuery.data.phone ?? '',
      });
    }
  }, [shopQuery.data, reset]);

  const selectedType = watch('type');
  const selectedCurrency = watch('currency');
  const selectedTimezone = watch('timezone');

  const saveMutation = useMutation({
    mutationFn: (values: ShopSettingsValues) =>
      shopRepository.update({
        name: values.name.trim(),
        type: values.type,
        currency: values.currency.trim().toUpperCase(),
        timezone: values.timezone.trim(),
        address: values.address?.trim() || null,
        phone: values.phone?.trim() || null,
      }),
    onSuccess: (updated) => {
      updateShopInStore(updated);
      router.back();
    },
  });

  if (shopQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Shop Settings" />
        <LoadingState message="Loading shop settings..." />
      </SafeAreaView>
    );
  }

  if (shopQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Shop Settings" />
        <ErrorState
          message={extractApiErrorMessage(shopQuery.error, 'Could not load shop profile')}
          onRetry={() => void shopQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Shop Settings" subtitle="Profile, currency & timezone" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 40 }}
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
              {extractApiErrorMessage(saveMutation.error, 'Could not save settings')}
            </Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Shop name"
              required
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
            />
          )}
        />

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Shop type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SHOP_TYPES.map((typeOption) => {
              const active = selectedType === typeOption;
              return (
                <Pressable
                  key={typeOption}
                  onPress={() => setValue('type', typeOption)}
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
                    {SHOP_TYPE_LABELS[typeOption]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Currency</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRESET_CURRENCIES.map((code) => {
              const active = selectedCurrency.toUpperCase() === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setValue('currency', code)}
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
                    {code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Controller
            control={control}
            name="currency"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Currency code"
                required
                autoCapitalize="characters"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.currency?.message}
              />
            )}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Timezone</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRESET_TIMEZONES.map((tz) => {
              const active = selectedTimezone === tz;
              return (
                <Pressable
                  key={tz}
                  onPress={() => setValue('timezone', tz)}
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
                    {tz}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Controller
            control={control}
            name="timezone"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="IANA Timezone"
                required
                placeholder="Asia/Karachi"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.timezone?.message}
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Shop phone"
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
              label="Shop address"
              multiline
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.address?.message}
            />
          )}
        />

        <PrimaryButton
          title="Save Shop Settings"
          loading={saveMutation.isPending}
          onPress={() => void handleSubmit((v) => saveMutation.mutate(v))()}
        />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
