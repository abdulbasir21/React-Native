import { Ionicons } from "@expo/vector-icons";
import type { NotificationDto } from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { apiRequest } from "../src/api/client";
import { AuthGate } from "../src/components/AuthGate";
import { Button } from "../src/components/Button";
import { useAuth } from "../src/features/auth/AuthProvider";
import { CARD_SHADOW } from "../src/theme/tokens";

export default function NotificationsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications", "my"],
    enabled: Boolean(user),
    queryFn: async () => {
      return apiRequest<{
        notifications: NotificationDto[];
        unreadCount: number;
      }>("/api/v1/notifications");
    },
  });

  if (!user) {
    return <AuthGate title="Notifications" />;
  }

  const markRead = async (id: string) => {
    await apiRequest(`/api/v1/notifications/${id}/read`, { method: "POST" });
    await refetch();
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllRead = async () => {
    await apiRequest("/api/v1/notifications/read-all", { method: "POST" });
    await refetch();
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#0D16A8" />
        <Text className="mt-2 text-xs text-muted">
          Loading notifications...
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-sm font-medium text-danger">
          Could not load notifications.
        </Text>
        <View className="mt-4 w-full">
          <Button
            title="Retry"
            variant="secondary"
            icon="refresh"
            onPress={() => void refetch()}
          />
        </View>
      </View>
    );
  }

  const items = data?.notifications ?? [];

  return (
    <View className="flex-1 bg-canvas">
      {data && data.unreadCount > 0 ? (
        <View className="border-b border-hairline bg-surface px-4 py-3">
          <Button
            title={`Mark all read (${data.unreadCount})`}
            variant="secondary"
            icon="checkmark-done"
            onPress={() => void markAllRead()}
          />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View
            style={CARD_SHADOW}
            className="items-center rounded-2xl bg-surface p-8"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
              <Ionicons name="notifications-outline" size={26} color="#0D16A8" />
            </View>
            <Text className="mt-3 text-base font-bold text-ink">
              No notifications yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              Booking updates, messages, and reviews will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (!item.isRead) void markRead(item.id);
            }}
            style={CARD_SHADOW}
            className={`min-h-[44px] rounded-2xl border p-4 ${
              item.isRead
                ? "border-transparent bg-surface"
                : "border-brand-tint-border bg-surface"
            }`}
          >
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1 flex-row items-center gap-2">
                <Ionicons
                  name={item.isRead ? "mail-open-outline" : "mail-unread"}
                  size={16}
                  color={item.isRead ? "#94A3B8" : "#0D16A8"}
                />
                <Text className="flex-1 text-sm font-bold text-ink">
                  {item.title}
                </Text>
              </View>
              {!item.isRead ? (
                <View className="h-2.5 w-2.5 rounded-full bg-brand" />
              ) : null}
            </View>
            <Text className="mt-1.5 text-sm text-muted">{item.body}</Text>
            <Text className="mt-2 text-xs text-muted">
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
