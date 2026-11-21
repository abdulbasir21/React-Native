import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { STRINGS } from "../strings/en";
import { CARD_SHADOW } from "../theme/tokens";
import { Button } from "./Button";

export function AuthGate({ title }: { title: string }) {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6 pb-24">
      <View
        style={CARD_SHADOW}
        className="w-full max-w-sm items-center rounded-3xl bg-surface p-6"
      >
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
          <Ionicons name="lock-closed" size={28} color="#0D16A8" />
        </View>
        <Text className="mt-4 text-xl font-bold text-ink">{title}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">
          {STRINGS.auth.loginRequiredBody}
        </Text>
        <View className="mt-6 w-full gap-3">
          <Button
            title={STRINGS.auth.signInButton}
            icon="log-in-outline"
            onPress={() => router.push("/(auth)/login")}
          />
          <Button
            title={STRINGS.auth.createAccountButton}
            variant="secondary"
            icon="person-add-outline"
            onPress={() => router.push("/(auth)/register")}
          />
        </View>
      </View>
    </View>
  );
}
