import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@skillconnect/shared";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";

export default function LoginScreen() {
  const router = useRouter();
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
        contentContainerClassName="flex-grow justify-center px-4 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-xl border border-hairline bg-surface p-6">
          <Text className="text-2xl font-semibold text-ink">
            {STRINGS.auth.loginTitle}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {STRINGS.auth.loginSubtitle}
          </Text>

          {serverError ? (
            <View className="mt-4 rounded-xl bg-danger-bg px-4 py-3">
              <Text className="text-sm text-danger">{serverError}</Text>
            </View>
          ) : null}

          <View className="mt-5 gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={STRINGS.auth.emailLabel}
                  placeholder={STRINGS.auth.emailPlaceholder}
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
                isSubmitting ? STRINGS.auth.signingIn : STRINGS.auth.signInButton
              }
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
            />
          </View>

          <View className="mt-5 items-center gap-3">
            <Link href="/(auth)/register" asChild>
              <Text className="py-2 text-sm font-semibold text-brand">
                {STRINGS.auth.noAccountPrompt}
              </Text>
            </Link>
            <Link href="/(tabs)" asChild>
              <Text className="py-2 text-sm text-muted">
                {STRINGS.auth.continueAsGuest}
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
