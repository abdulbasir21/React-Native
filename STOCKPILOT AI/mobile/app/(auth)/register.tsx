import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
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
  registerStep1Schema,
  SHOP_TYPE_LABELS,
  type RegisterStep1Values,
} from '../../src/api/authApi';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { SHOP_TYPES } from '../../src/shared/enums';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

/**
 * Matches design/04-registration.png (Step 1 of 2: Account & Business Details).
 */
export default function RegisterScreen() {
  const router = useRouter();
  const registrationDraft = useSessionStore((s) => s.registrationDraft);
  const setRegistrationDraft = useSessionStore((s) => s.setRegistrationDraft);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterStep1Values>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues: {
      ownerName: registrationDraft?.ownerName ?? '',
      shopName: registrationDraft?.shopName ?? '',
      email: registrationDraft?.email ?? '',
      password: registrationDraft?.password ?? '',
      phone: registrationDraft?.phone ?? '',
      shopType: registrationDraft?.shopType ?? 'MOBILE_ACCESSORIES',
    },
  });

  const onContinue = handleSubmit((values) => {
    setRegistrationDraft(values);
    router.push('/(auth)/shop-setup');
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
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
                Step 1 of 2: Account & Business Details
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View style={{ width: '50%', height: '100%', backgroundColor: colors.primary }} />
          </View>

          <View style={{ gap: 6, marginTop: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
              <Text style={{ ...typography.labelSm, color: colors.primary, letterSpacing: 0.6 }}>
                STOCKPILOT RETAIL ENGINE
              </Text>
            </View>
            <Text style={{ ...typography.headlineLg, color: colors.textPrimary }}>
              Create shop account
            </Text>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Start running your retail shop faster with local offline backup.
            </Text>
          </View>

          <Controller
            control={control}
            name="ownerName"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Owner full name"
                required
                icon="person-outline"
                placeholder="e.g. Ahmed Raza"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.ownerName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="shopName"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Shop / Business name"
                required
                icon="storefront-outline"
                placeholder="e.g. Al-Madina Mobile Accessories"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.shopName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Email address"
                required
                icon="mail-outline"
                placeholder="ahmed.retail@gmail.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Password"
                required
                rightHint="Min. 8 chars"
                icon="lock-closed-outline"
                placeholder="Create a secure password"
                isPassword
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.password?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Phone number (optional)"
                icon="call-outline"
                placeholder="+92 300 1234567"
                keyboardType="phone-pad"
                value={value ?? ''}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.phone?.message}
              />
            )}
          />

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>Shop category</Text>
              <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Select one</Text>
            </View>
            <Controller
              control={control}
              name="shopType"
              render={({ field: { onChange, value } }) => (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {SHOP_TYPES.map((type) => {
                    const selected = value === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => onChange(type)}
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 14,
                          borderRadius: radii.pill,
                          borderWidth: 1.5,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primarySoft : colors.surface,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {selected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                        <Text
                          style={{
                            ...typography.labelLg,
                            color: selected ? colors.primary : colors.textSecondary,
                          }}
                        >
                          {SHOP_TYPE_LABELS[type]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
          </View>

          <View style={{ paddingTop: spacing.sm, gap: spacing.sm }}>
            <PrimaryButton title="Continue to Shop Setup ->" onPress={() => void onContinue()} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
                Already registered?
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable style={{ minHeight: layout.minTouchTarget, justifyContent: 'center' }}>
                  <Text style={{ ...typography.labelLg, color: colors.primary }}>Log in</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
