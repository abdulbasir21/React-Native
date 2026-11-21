import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AuthGate } from "../../src/components/AuthGate";
import { Button } from "../../src/components/Button";
import { HeroHeader } from "../../src/components/HeroHeader";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";
import { STRINGS } from "../../src/strings/en";
import { CARD_SHADOW } from "../../src/theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function AccountRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  onPress,
}: {
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={CARD_SHADOW}
      className="min-h-[68px] flex-row items-center gap-3.5 rounded-2xl bg-surface p-4 active:bg-canvas"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: iconBg }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-ink">{title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

export default function AccountTab() {
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const { location } = useLocationSelection();

  if (isLoading) return null;
  if (!user) {
    return (
      <View className="flex-1 bg-canvas">
        <HeroHeader title="Account" subtitle="Sign in to manage your profile" />
        <View className="-mt-3 flex-1 rounded-t-[30px] bg-canvas">
          <AuthGate title={STRINGS.tabs.account} />
        </View>
      </View>
    );
  }

  const isProvider = user.roles.includes("PROVIDER");

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
    >
      <HeroHeader title="My Account" subtitle={user.email} showAvatar={false} />

      <View className="-mt-3 rounded-t-[30px] bg-canvas px-4 pb-28 pt-5">
        {/* Profile Summary Card */}
        <View
          style={CARD_SHADOW}
          className="flex-row items-center gap-4 rounded-2xl bg-surface p-5"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
            <Text className="text-2xl font-bold text-brand">
              {user.fullName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-ink">{user.fullName}</Text>
            <Text className="mt-0.5 text-xs text-muted">{user.email}</Text>
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {user.roles.map((r) => (
                <View
                  key={r}
                  className="rounded-full bg-brand-tint px-2.5 py-0.5"
                >
                  <Text className="text-[10px] font-bold text-brand">{r}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Action Rows */}
        <View className="mt-5 gap-3">
          <AccountRow
            icon="notifications"
            iconBg="#EAEFFF"
            iconColor="#0D16A8"
            title="Notifications"
            subtitle="Messages, booking alerts & review updates"
            onPress={() => router.push("/notifications")}
          />

          <AccountRow
            icon="briefcase"
            iconBg="#FEF3C7"
            iconColor="#D97706"
            title={isProvider ? "Provider Area" : "Become a Service Provider"}
            subtitle={
              isProvider
                ? "Manage services, hours & verification status"
                : "Offer your trade skills to nearby customers"
            }
            onPress={() => router.push("/become-provider")}
          />

          <AccountRow
            icon="location"
            iconBg="#E9F9E5"
            iconColor="#2A8F17"
            title="Location Preferences"
            subtitle={location?.label ?? "Select your current area"}
            onPress={() => router.push("/location")}
          />
        </View>

        <View className="mt-6">
          <Button
            title={STRINGS.auth.signOutButton}
            variant="secondary"
            icon="log-out-outline"
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </ScrollView>
  );
}
