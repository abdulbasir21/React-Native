import type { ConversationDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { apiRequest } from "../../src/api/client";
import { AuthGate } from "../../src/components/AuthGate";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { STRINGS } from "../../src/strings/en";

export default function ChatsTab() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["chat", "conversations"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await apiRequest<{ conversations: ConversationDto[] }>(
        "/api/v1/conversations"
      );
      return res.conversations;
    },
  });

  if (authLoading) return null;
  if (!user) return <AuthGate title={STRINGS.tabs.chats} />;

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      {isLoading ? (
        <Text className="text-sm text-muted">Loading conversations...</Text>
      ) : isError ? (
        <View className="rounded-xl border border-hairline bg-surface p-4">
          <Text className="text-sm text-danger">
            Could not load conversations.
          </Text>
          <View className="mt-3">
            <Button
              title="Retry"
              variant="secondary"
              onPress={() => void refetch()}
            />
          </View>
        </View>
      ) : conversations.length === 0 ? (
        <View className="rounded-xl border border-hairline bg-surface p-6">
          <Text className="text-base font-semibold text-ink">
            No conversations yet
          </Text>
          <Text className="mt-1 text-sm text-muted">
            Find a verified technician and tap Message Worker to start chatting.
          </Text>
        </View>
      ) : (
        <View className="gap-3 pb-8">
          {conversations.map((conv) => (
            <Pressable
              key={conv.id}
              onPress={() => router.push(`/chat/${conv.id}`)}
              className="min-h-[68px] flex-row items-center justify-between rounded-xl border border-hairline bg-surface p-4 active:bg-canvas"
            >
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-ink">
                  {conv.otherParty.displayName}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-sm text-muted">
                  {conv.latestMessage?.preview ?? "Tap to start chatting"}
                </Text>
              </View>
              {conv.unreadCount > 0 ? (
                <View className="min-w-[24px] items-center rounded-full bg-brand px-2 py-0.5">
                  <Text className="text-xs font-semibold text-white">
                    {conv.unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
