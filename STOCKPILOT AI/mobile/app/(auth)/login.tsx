import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
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
import { loginApi, loginFormSchema, type LoginFormValues } from '../../src/api/authApi';
import { extractApiErrorMessage } from '../../src/api/client';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

/**
 * Matches design/03-login.png (excluding out-of-scope Forgot Password & Biometric/Cashier Shift).
 */
export default function LoginScreen() {
  const router = useRouter();
  const setSession = useSessionStore((s) => s.setSession);
  const sessionExpiredMessage = useSessionStore((s) => s.sessionExpiredMessage);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: loginApi,
    onSuccess: async (payload) => {
      await setSession(payload);
      router.replace('/(tabs)');
    },
  });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: spacing.lg,
            justifyContent: 'space-between',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                onPress={() => router.replace('/(auth)/onboarding')}
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
                  gap: 8,
                  backgroundColor: colors.surface,
                  borderRadius: radii.pill,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="cube-outline" size={16} color={colors.primary} />
                <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>StockPilot AI</Text>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: radii.pill,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>

              <View style={{ width: 44 }} />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ ...typography.headlineLg, color: colors.textPrimary }}>Welcome back</Text>
              <Text style={{ ...typography.bodyLg, color: colors.textSecondary }}>
                Log in to manage your registered retail shop.
              </Text>
            </View>

            {sessionExpiredMessage ? (
              <View
                style={{
                  backgroundColor: colors.warningBg,
                  borderRadius: radii.md,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.warning,
                }}
              >
                <Text style={{ ...typography.bodyMd, color: colors.warningText, fontWeight: '600' }}>
                  {sessionExpiredMessage}
                </Text>
              </View>
            ) : null}

            {loginMutation.isError ? (
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
                  {extractApiErrorMessage(loginMutation.error, 'Invalid email or password')}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.md }}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Email address"
                    required
                    icon="mail-outline"
                    placeholder="owner@example.com"
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
                    icon="lock-closed-outline"
                    placeholder="Enter your password"
                    isPassword
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={errors.password?.message}
                  />
                )}
              />
            </View>

            <PrimaryButton
              title="Log in to StockPilot"
              onPress={() => void onSubmit()}
              loading={loginMutation.isPending}
            />
          </View>

          <View style={{ gap: spacing.md, paddingTop: spacing.xl, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
                Don&apos;t have a shop account?
              </Text>
              <Link href="/(auth)/register" asChild>
                <Pressable style={{ minHeight: layout.minTouchTarget, justifyContent: 'center' }}>
                  <Text style={{ ...typography.labelLg, color: colors.primary }}>
                    Register your shop
                  </Text>
                </Pressable>
              </Link>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surface,
                borderRadius: radii.pill,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                Offline data stored locally on device
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
