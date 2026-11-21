import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@skillconnect/shared";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";
import { CARD_SHADOW } from "../../src/theme/tokens";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await signIn(values);
      router.replace("/(tabs)");
    } catch (err) {
      setServerError(
        err instanceof MobileApiError ? err.message : "Unable to sign in"
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="bg-brand px-6 pb-10"
          style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <Ionicons name="construct" size={24} color="#FFFFFF" />
          </View>
          <Text className="mt-4 text-2xl font-bold text-white">
            {STRINGS.auth.loginTitle}
          </Text>
          <Text className="mt-1 text-sm text-white/80">
            {STRINGS.auth.loginSubtitle}
          </Text>
        </View>

        <View className="-mt-4 flex-1 rounded-t-[30px] bg-canvas px-4 pt-6">
          <View style={CARD_SHADOW} className="rounded-3xl bg-surface p-6">
            {serverError ? (
              <View className="mb-4 flex-row items-center gap-2 rounded-2xl bg-danger-bg px-4 py-3">
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text className="flex-1 text-sm text-danger">{serverError}</Text>
              </View>
            ) : null}

            <View className="gap-4">
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={STRINGS.auth.emailLabel}
                    placeholder={STRINGS.auth.emailPlaceholder}
                    icon="mail-outline"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={STRINGS.auth.passwordLabel}
                    placeholder={STRINGS.auth.passwordPlaceholder}
                    icon="lock-closed-outline"
                    secureTextEntry
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.password?.message}
                  />
                )}
              />

              <Button
                title={
                  isSubmitting
                    ? STRINGS.auth.signingIn
                    : STRINGS.auth.signInButton
                }
                icon="log-in-outline"
                loading={isSubmitting}
                onPress={handleSubmit(onSubmit)}
              />
            </View>

            <View className="mt-5 items-center gap-3">
              <Link href="/(auth)/register" asChild>
                <Text className="py-2 text-sm font-bold text-brand">
                  {STRINGS.auth.noAccountPrompt}
                </Text>
              </Link>
              <Link href="/(tabs)" asChild>
                <Text className="py-2 text-sm font-medium text-muted">
                  {STRINGS.auth.continueAsGuest}
                </Text>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
