import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@skillconnect/shared";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);
    try {
      await signUp(values);
      router.replace("/(tabs)");
    } catch (err) {
      setServerError(
        err instanceof MobileApiError ? err.message : "Unable to create account"
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
            {STRINGS.auth.registerTitle}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {STRINGS.auth.registerSubtitle}
          </Text>

          {serverError ? (
            <View className="mt-4 rounded-xl bg-danger-bg px-4 py-3">
              <Text className="text-sm text-danger">{serverError}</Text>
            </View>
          ) : null}

          <View className="mt-5 gap-4">
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={STRINGS.auth.fullNameLabel}
                  placeholder={STRINGS.auth.fullNamePlaceholder}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.fullName?.message}
                />
              )}
            />

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
                isSubmitting
                  ? STRINGS.auth.creatingAccount
                  : STRINGS.auth.createAccountButton
              }
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
            />
          </View>

          <View className="mt-5 items-center">
            <Link href="/(auth)/login" asChild>
              <Text className="py-2 text-sm font-semibold text-brand">
                {STRINGS.auth.haveAccountPrompt}
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
