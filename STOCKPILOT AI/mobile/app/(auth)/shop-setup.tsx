import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  registerApi,
  shopSetupSchema,
  type ShopSetupValues,
} from '../../src/api/authApi';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

const PRESET_CURRENCIES = [
  { code: 'PKR', label: 'PKR - Pakistani Rupee' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'AED', label: 'AED - UAE Dirham' },
] as const;

const PRESET_TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'UTC'] as const;

/**
 * Matches design/05-shop-setup.png (Step 2 of 2: Currency, Timezone, Optional Address).
 */
export default function ShopSetupScreen() {
  const router = useRouter();
  const registrationDraft = useSessionStore((s) => s.registrationDraft);
  const setSession = useSessionStore((s) => s.setSession);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ShopSetupValues>({
    resolver: zodResolver(shopSetupSchema),
    defaultValues: {
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      address: '',
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerApi,
    onSuccess: async (payload) => {
      await setSession(payload);
      router.replace('/(tabs)');
    },
  });

  if (!registrationDraft) {
    return <Redirect href="/(auth)/register" />;
  }

  const onSubmit = handleSubmit((setupValues) => {
    registerMutation.mutate({
      ownerName: registrationDraft.ownerName,
      shopName: registrationDraft.shopName,
      email: registrationDraft.email,
      password: registrationDraft.password,
      shopType: registrationDraft.shopType,
      phone: registrationDraft.phone?.trim() || null,
      currency: setupValues.currency.trim().toUpperCase(),
      timezone: setupValues.timezone.trim(),
      address: setupValues.address?.trim() || null,
    });
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: -10,
              }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surface,
                borderRadius: radii.pill,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{ width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.primary }}
              />
              <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                STEP 2 OF 2: FINAL CONFIGURATION
              </Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ ...typography.headlineLg, color: colors.textPrimary }}>
              Set up your shop
            </Text>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Configure regional settings for{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {registrationDraft.shopName}
              </Text>
            </Text>
          </View>

          {registerMutation.isError ? (
            <View
              style={{
                backgroundColor: colors.errorBg,
                borderRadius: radii.md,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.errorBorder,
              }}
            >
              <Text style={{ ...typography.bodyMd, color: colors.errorText, fontWeight: '600' }}>
                {extractApiErrorMessage(registerMutation.error, 'Registration failed')}
              </Text>
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
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Primary Currency</Text>
              <View
                style={{
                  backgroundColor: colors.primarySoft,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: radii.pill,
                }}
              >
                <Text style={{ ...typography.labelSm, color: colors.primary }}>Standard</Text>
              </View>
            </View>

            <Controller
              control={control}
              name="currency"
              render={({ field: { onChange, value } }) => (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {PRESET_CURRENCIES.map((c) => {
                      const active = value.toUpperCase() === c.code;
                      return (
                        <Pressable
                          key={c.code}
                          onPress={() => onChange(c.code)}
                          style={{
                            minHeight: 44,
                            paddingHorizontal: 14,
                            borderRadius: radii.md,
                            borderWidth: 1.5,
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primarySoft : colors.surface,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{
                              ...typography.labelLg,
                              color: active ? colors.primary : colors.textPrimary,
                            }}
                          >
                            {c.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <FormField
                    label="Currency code"
                    placeholder="PKR"
                    autoCapitalize="characters"
                    value={value}
                    onChangeText={onChange}
                    error={errors.currency?.message}
                  />
                </View>
              )}
            />
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
            <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Shop Timezone</Text>
            <Controller
              control={control}
              name="timezone"
              render={({ field: { onChange, value } }) => (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {PRESET_TIMEZONES.map((tz) => {
                      const active = value === tz;
                      return (
                        <Pressable
                          key={tz}
                          onPress={() => onChange(tz)}
                          style={{
                            minHeight: 44,
                            paddingHorizontal: 14,
                            borderRadius: radii.pill,
                            borderWidth: 1.5,
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primarySoft : colors.surface,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              ...typography.labelMd,
                              color: active ? colors.primary : colors.textSecondary,
                              fontWeight: '700',
                            }}
                          >
                            {tz}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <FormField
                    label="IANA Timezone"
                    placeholder="Asia/Karachi"
                    autoCapitalize="none"
                    value={value}
                    onChangeText={onChange}
                    error={errors.timezone?.message}
                  />
                </View>
              )}
            />
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
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Shop Address & Market (Optional)"
                  icon="location-outline"
                  placeholder="Shop # 14, Hall Road Mobile Market, Lahore"
                  value={value ?? ''}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  error={errors.address?.message}
                />
              )}
            />
          </View>

          <View
            style={{
              backgroundColor: colors.primarySoft,
              borderRadius: radii.md,
              padding: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Ionicons name="cloud-done-outline" size={22} color={colors.primary} />
            <Text style={{ flex: 1, ...typography.bodySm, color: colors.primaryDeep }}>
              Your shop currency and timezone can be updated anytime in More &gt; Settings.
            </Text>
          </View>

          <View style={{ paddingTop: spacing.sm }}>
            <PrimaryButton
              title="Start using StockPilot"
              onPress={() => void onSubmit()}
              loading={registerMutation.isPending}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
