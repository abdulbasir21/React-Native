import { Ionicons } from "@expo/vector-icons";
import type { BookingDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { apiRequest } from "../../src/api/client";
import { AuthGate } from "../../src/components/AuthGate";
import { Button } from "../../src/components/Button";
import { HeroHeader } from "../../src/components/HeroHeader";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";
import { CARD_SHADOW } from "../../src/theme/tokens";

function statusStyle(status: string): { bg: string; text: string } {
  if (status === "COMPLETED") {
    return { bg: "bg-location-tint", text: "text-location-dark" };
  }
  if (status.includes("CANCEL") || status.includes("DISPUTE") || status.includes("NO_SHOW")) {
    return { bg: "bg-danger-bg", text: "text-danger" };
  }
  if (status === "PROVIDER_COMPLETED") {
    return { bg: "bg-amber-tint", text: "text-amber-trust" };
  }
  return { bg: "bg-brand-tint", text: "text-brand" };
}

export default function BookingsTab() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["bookings", "my"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await apiRequest<{ bookings: BookingDto[] }>("/api/v1/bookings");
      return res.bookings;
    },
  });

  if (authLoading) return null;
  if (!user) {
    return (
      <View className="flex-1 bg-canvas">
        <HeroHeader title="Bookings" subtitle="Track your scheduled services" />
        <View className="-mt-3 flex-1 rounded-t-[30px] bg-canvas">
          <AuthGate title={STRINGS.tabs.bookings} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
    >
      <HeroHeader
        title="Bookings"
        subtitle="Manage active, completed & upcoming jobs"
      />

      <View className="-mt-3 rounded-t-[30px] bg-canvas px-4 pb-28 pt-5">
        {isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#0D16A8" />
            <Text className="mt-2 text-xs text-muted">Loading bookings...</Text>
          </View>
        ) : isError ? (
          <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-5">
            <Text className="text-sm font-medium text-danger">
              Could not load bookings.
            </Text>
            <View className="mt-3">
              <Button
                title="Retry"
                variant="secondary"
                icon="refresh"
                onPress={() => void refetch()}
              />
            </View>
          </View>
        ) : bookings.length === 0 ? (
          <View
            style={CARD_SHADOW}
            className="items-center rounded-2xl bg-surface p-7"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
              <Ionicons name="calendar-outline" size={26} color="#0D16A8" />
            </View>
            <Text className="mt-3 text-base font-bold text-ink">
              No bookings yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              Accept a service offer in chat to create your first booking.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {bookings.map((b) => {
              const badge = statusStyle(b.status);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/booking/${b.id}`)}
                  style={CARD_SHADOW}
                  className="rounded-2xl bg-surface p-4 active:bg-canvas"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-base font-bold text-ink">
                      {b.serviceName}
                    </Text>
                    <View className={`rounded-full px-2.5 py-1 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {b.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-1.5 flex-row items-center gap-1.5">
                    <Ionicons name="person-outline" size={13} color="#64748B" />
                    <Text className="text-xs text-muted">
                      {b.customerUserId === user.id
                        ? `Provider: ${b.providerDisplayName}`
                        : `Customer: ${b.customerFullName}`}
                    </Text>
                  </View>

                  <View className="mt-3 flex-row items-center justify-between border-t border-hairline pt-2.5">
                    <Text className="text-sm font-bold text-location-dark">
                      Rs. {b.pricePkr}
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="time-outline" size={13} color="#64748B" />
                      <Text className="text-xs text-muted">
                        {new Date(b.scheduledStart).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
