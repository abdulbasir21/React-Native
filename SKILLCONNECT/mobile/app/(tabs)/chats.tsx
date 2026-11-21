import { Ionicons } from "@expo/vector-icons";
import type { ConversationDto } from "@skillconnect/shared";
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
  if (!user) {
    return (
      <View className="flex-1 bg-canvas">
        <HeroHeader title="Messages" subtitle="Chat directly with technicians" />
        <View className="-mt-3 flex-1 rounded-t-[30px] bg-canvas">
          <AuthGate title={STRINGS.tabs.chats} />
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
        title="Messages"
        subtitle="Direct chats & service offers"
      />

      <View className="-mt-3 rounded-t-[30px] bg-canvas px-4 pb-28 pt-5">
        {isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#0D16A8" />
            <Text className="mt-2 text-xs text-muted">
              Loading conversations...
            </Text>
          </View>
        ) : isError ? (
          <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-5">
            <Text className="text-sm font-medium text-danger">
              Could not load conversations.
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
        ) : conversations.length === 0 ? (
          <View
            style={CARD_SHADOW}
            className="items-center rounded-2xl bg-surface p-7"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
              <Ionicons name="chatbubbles-outline" size={26} color="#0D16A8" />
            </View>
            <Text className="mt-3 text-base font-bold text-ink">
              No conversations yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              Find a verified technician and tap Message Worker to start chatting.
            </Text>
            <View className="mt-4 w-full">
              <Button
                title="Find Technicians"
                icon="search"
                onPress={() => router.push("/(tabs)/search")}
              />
            </View>
          </View>
        ) : (
          <View className="gap-3">
            {conversations.map((conv) => (
              <Pressable
                key={conv.id}
                onPress={() => router.push(`/chat/${conv.id}`)}
                style={CARD_SHADOW}
                className="min-h-[76px] flex-row items-center gap-3.5 rounded-2xl bg-surface p-4 active:bg-canvas"
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
                  <Text className="text-base font-bold text-brand">
                    {conv.otherParty.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View className="flex-1 pr-2">
                  <Text className="text-base font-bold text-ink">
                    {conv.otherParty.displayName}
                  </Text>
                  <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">
                    {conv.latestMessage?.preview ?? "Tap to start chatting"}
                  </Text>
                </View>

                {conv.unreadCount > 0 ? (
                  <View className="min-w-[26px] items-center rounded-full bg-brand px-2 py-1">
                    <Text className="text-xs font-bold text-white">
                      {conv.unreadCount}
                    </Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
