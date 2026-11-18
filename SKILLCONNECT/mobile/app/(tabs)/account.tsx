import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { AuthGate } from "../../src/components/AuthGate";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";

export default function AccountTab() {
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) return null;
  if (!user) return <AuthGate title={STRINGS.tabs.account} />;

  const isProvider = user.roles.includes("PROVIDER");

  return (
    <View className="flex-1 bg-canvas p-4">
      <View className="rounded-xl border border-hairline bg-surface p-5">
        <Text className="text-lg font-semibold text-ink">{user.fullName}</Text>
        <Text className="mt-1 text-sm text-muted">{user.email}</Text>
        <Text className="mt-2 text-xs font-semibold text-brand">
          Roles: {user.roles.join(", ")}
        </Text>
        <View className="mt-5 gap-3">
          <Button
            title="Notifications"
            variant="secondary"
            onPress={() => router.push("/notifications")}
          />
          <Button
            title={isProvider ? "Provider Area" : "Become a provider"}
            onPress={() => router.push("/become-provider")}
          />
          <Button
            title={STRINGS.auth.signOutButton}
            variant="secondary"
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </View>
  );
}
