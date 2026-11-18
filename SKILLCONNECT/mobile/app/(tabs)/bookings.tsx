import type { BookingDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { apiRequest } from "../../src/api/client";
import { AuthGate } from "../../src/components/AuthGate";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";

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
  if (!user) return <AuthGate title={STRINGS.tabs.bookings} />;

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      {isLoading ? (
        <Text className="text-sm text-muted">Loading bookings...</Text>
      ) : isError ? (
        <View className="rounded-xl border border-hairline bg-surface p-4">
          <Text className="text-sm text-danger">Could not load bookings.</Text>
          <View className="mt-3">
            <Button
              title="Retry"
              variant="secondary"
              onPress={() => void refetch()}
            />
          </View>
        </View>
      ) : bookings.length === 0 ? (
        <View className="rounded-xl border border-hairline bg-surface p-6">
          <Text className="text-base font-semibold text-ink">
            No bookings yet
          </Text>
          <Text className="mt-1 text-sm text-muted">
            Accept a service offer in chat to create your first booking.
          </Text>
        </View>
      ) : (
        <View className="gap-3 pb-8">
          {bookings.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push(`/booking/${b.id}`)}
              className="rounded-xl border border-hairline bg-surface p-4 active:bg-canvas"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-base font-semibold text-ink">
                  {b.serviceName}
                </Text>
                <View className="rounded-full bg-brand-tint px-2.5 py-0.5">
                  <Text className="text-[11px] font-semibold text-brand">
                    {b.status}
                  </Text>
                </View>
              </View>
              <Text className="mt-1 text-xs text-muted">
                {b.customerUserId === user.id
                  ? `Provider: ${b.providerDisplayName}`
                  : `Customer: ${b.customerFullName}`}
              </Text>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-ink">
                  Rs. {b.pricePkr}
                </Text>
                <Text className="text-xs text-muted">
                  {new Date(b.scheduledStart).toLocaleString()}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
