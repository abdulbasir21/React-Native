import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { STRINGS } from "../strings/en";
import { Button } from "./Button";

export function AuthGate({ title }: { title: string }) {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <View className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-6">
        <Text className="text-lg font-semibold text-ink">{title}</Text>
        <Text className="mt-2 text-sm text-muted">
          {STRINGS.auth.loginRequiredBody}
        </Text>
        <View className="mt-5 gap-3">
          <Button
            title={STRINGS.auth.signInButton}
            onPress={() => router.push("/(auth)/login")}
          />
          <Button
            title={STRINGS.auth.createAccountButton}
            variant="secondary"
            onPress={() => router.push("/(auth)/register")}
          />
        </View>
      </View>
    </View>
  );
}
