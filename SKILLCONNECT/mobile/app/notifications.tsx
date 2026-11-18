import type { NotificationDto } from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, Text, View } from "react-native";
import { apiRequest } from "../src/api/client";
import { AuthGate } from "../src/components/AuthGate";
import { Button } from "../src/components/Button";
import { useAuth } from "../src/features/auth/AuthProvider";

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
        <Text className="text-sm text-muted">Loading notifications...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-sm text-danger">
          Could not load notifications.
        </Text>
        <View className="mt-4 w-full">
          <Button
            title="Retry"
            variant="secondary"
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
            onPress={() => void markAllRead()}
          />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-base font-semibold text-ink">
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
            className={`min-h-[44px] rounded-xl border p-4 ${
              item.isRead
                ? "border-hairline bg-surface"
                : "border-primary bg-surface"
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-ink">
                {item.title}
              </Text>
              {!item.isRead ? (
                <View className="h-2.5 w-2.5 rounded-full bg-primary" />
              ) : null}
            </View>
            <Text className="mt-1 text-sm text-muted">{item.body}</Text>
            <Text className="mt-2 text-xs text-muted">
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
