import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../features/auth/AuthProvider";

interface HeroHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
  showAvatar?: boolean;
  children?: ReactNode;
}

export function HeroHeader({
  title,
  subtitle,
  showNotifications = true,
  showAvatar = true,
  children,
}: HeroHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const initial = user?.fullName?.trim().slice(0, 1).toUpperCase() || "S";

  return (
    <View
      className="relative overflow-hidden bg-brand px-5 pb-6"
      style={{ paddingTop: Math.max(insets.top, 14) + 8 }}
    >
      {/* Layered diagonal geometric facets inspired by reference hero */}
      <View
        pointerEvents="none"
        className="absolute -right-12 -top-12 h-44 w-44 rotate-45 rounded-3xl bg-brand-dark opacity-70"
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-16 right-16 h-36 w-36 rotate-12 rounded-3xl bg-brand-bright opacity-35"
      />

      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-white/15">
              <Ionicons name="construct" size={16} color="#FFFFFF" />
            </View>
            <Text className="text-xl font-bold tracking-tight text-white">
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text className="mt-1.5 text-xs font-medium text-white/80">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2.5">
          {showNotifications ? (
            <Pressable
              onPress={() => router.push("/notifications")}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              className="h-10 w-10 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
            >
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {showAvatar ? (
            <Pressable
              onPress={() => router.push("/(tabs)/account")}
              accessibilityRole="button"
              accessibilityLabel="Account"
              className="h-10 w-10 items-center justify-center rounded-full border-2 border-amber-bright bg-white active:opacity-85"
            >
              {user ? (
                <Text className="text-sm font-bold text-brand">{initial}</Text>
              ) : (
                <Ionicons name="person" size={18} color="#0D16A8" />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {children ? <View className="mt-4">{children}</View> : null}
    </View>
  );
}
