import { Ionicons } from "@expo/vector-icons";
import type {
  AiChatAssistOutputDto,
  AiStructureOfferOutputDto,
  ConversationDto,
  MessageDto,
  ServiceOfferDto,
} from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  apiRequest,
  getStoredTokens,
  MobileApiError,
  uploadImageRequest,
} from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { CARD_SHADOW } from "../../src/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

function makeClientId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChatThreadScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerName, setOfferName] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerHoursAhead, setOfferHoursAhead] = useState("24");
  const [offerRawText, setOfferRawText] = useState("");
  const [aiOfferBusy, setAiOfferBusy] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiAssistResult, setAiAssistResult] =
    useState<AiChatAssistOutputDto | null>(null);
  const [aiAssistBusy, setAiAssistBusy] = useState(false);
  const [serviceAddress, setServiceAddress] = useState("");
  const socketRef = useRef<Socket | null>(null);

  const { data: conversation } = useQuery({
    queryKey: ["chat", "conversation", conversationId],
    enabled: Boolean(conversationId && user),
    queryFn: async () => {
      const res = await apiRequest<{ conversation: ConversationDto }>(
        `/api/v1/conversations/${conversationId}`
      );
      return res.conversation;
    },
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["chat", "offers", conversationId],
    enabled: Boolean(conversationId && user),
    queryFn: async () => {
      const res = await apiRequest<{ offers: ServiceOfferDto[] }>(
        `/api/v1/conversations/${conversationId}/offers`
      );
      return res.offers;
    },
  });

  const {
    data: messages = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["chat", "messages", conversationId],
    enabled: Boolean(conversationId && user),
    queryFn: async () => {
      const res = await apiRequest<{ messages: MessageDto[] }>(
        `/api/v1/conversations/${conversationId}/messages?limit=30`
      );
      return [...res.messages].reverse();
    },
  });

  useEffect(() => {
    if (!conversationId || !user) return;
    let active = true;

    void (async () => {
      const { accessToken } = await getStoredTokens();
      if (!active || !accessToken) return;

      const socket = io(API_URL, {
        auth: { token: accessToken },
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("conversation:join", { conversationId });
      });

      socket.on("message:new", (payload: { message: MessageDto }) => {
        if (
          !payload?.message ||
          payload.message.conversationId !== conversationId
        ) {
          return;
        }
        queryClient.setQueryData<MessageDto[]>(
          ["chat", "messages", conversationId],
          (old = []) => {
            if (old.some((m) => m.id === payload.message.id)) return old;
            return [...old, payload.message];
          }
        );
        void queryClient.invalidateQueries({
          queryKey: ["chat", "offers", conversationId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["chat", "conversations"],
        });
      });

      socket.on("offer:updated", () => {
        void queryClient.invalidateQueries({
          queryKey: ["chat", "offers", conversationId],
        });
      });
    })();

    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, user, queryClient]);

  useEffect(() => {
    if (!conversationId || !user || messages.length === 0) return;
    const latestFromOther = [...messages]
      .reverse()
      .find((m) => m.senderId !== user.id && !m.readAt);
    if (latestFromOther) {
      void apiRequest(`/api/v1/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({ upToMessageId: latestFromOther.id }),
      });
    }
  }, [conversationId, user, messages]);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || sending) return;
    setErrorMsg(null);
    setSending(true);
    try {
      const res = await apiRequest<{ message: MessageDto }>(
        `/api/v1/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "TEXT",
            body: trimmed,
            clientMessageId: makeClientId(),
          }),
        }
      );
      setText("");
      queryClient.setQueryData<MessageDto[]>(
        ["chat", "messages", conversationId],
        (old = []) =>
          old.some((m) => m.id === res.message.id) ? old : [...old, res.message]
      );
    } catch (err) {
      setErrorMsg(err instanceof MobileApiError ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async () => {
    if (!conversationId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const uploaded = await uploadImageRequest(picked.assets[0].uri, "chat");
      const res = await apiRequest<{ message: MessageDto }>(
        `/api/v1/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "IMAGE",
            imageUrl: uploaded.url,
            imageFileId: uploaded.fileId,
            clientMessageId: makeClientId(),
          }),
        }
      );
      queryClient.setQueryData<MessageDto[]>(
        ["chat", "messages", conversationId],
        (old = []) =>
          old.some((m) => m.id === res.message.id) ? old : [...old, res.message]
      );
    } catch (err) {
      setErrorMsg(
        err instanceof MobileApiError ? err.message : "Failed to send image"
      );
    } finally {
      setSending(false);
    }
  };

  const handleCreateOffer = async () => {
    if (!conversationId) return;
    setErrorMsg(null);
    try {
      const hours = Math.max(1, Number(offerHoursAhead) || 24);
      const proposedStart = new Date(
        Date.now() + hours * 60 * 60 * 1000
      ).toISOString();
      await apiRequest(`/api/v1/conversations/${conversationId}/offers`, {
        method: "POST",
        body: JSON.stringify({
          serviceName: offerName,
          description: offerDesc,
          pricePkr: Number(offerPrice),
          proposedStart,
        }),
      });
      setShowOfferModal(false);
      setOfferName("");
      setOfferDesc("");
      setOfferPrice("");
      void queryClient.invalidateQueries({
        queryKey: ["chat", "offers", conversationId],
      });
      void refetch();
    } catch (err) {
      setErrorMsg(
        err instanceof MobileApiError ? err.message : "Failed to create offer"
      );
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ booking: { id: string } }>(
        `/api/v1/offers/${offerId}/accept`,
        {
          method: "POST",
          body: JSON.stringify({ serviceAddress }),
        }
      );
      setServiceAddress("");
      void queryClient.invalidateQueries({
        queryKey: ["chat", "offers", conversationId],
      });
      void refetch();
      router.push(`/booking/${res.booking.id}`);
    } catch (err) {
      setErrorMsg(
        err instanceof MobileApiError ? err.message : "Failed to accept offer"
      );
    }
  };

  const pendingOffer = offers.find((o) => o.status === "PENDING");
  const isProvider = conversation?.myRole === "PROVIDER";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      {conversation ? (
        <View className="flex-row items-center justify-between border-b border-hairline bg-surface px-4 py-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint">
              <Text className="text-sm font-bold text-brand">
                {conversation.otherParty.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text className="text-base font-bold text-ink">
              {conversation.otherParty.displayName}
            </Text>
          </View>
          {isProvider ? (
            <Pressable
              onPress={() => setShowOfferModal(true)}
              className="min-h-[36px] flex-row items-center gap-1 rounded-xl bg-brand px-3"
            >
              <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
              <Text className="text-xs font-bold text-white">Send Offer</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {pendingOffer ? (
        <View
          style={CARD_SHADOW}
          className="mx-4 mt-3 rounded-2xl bg-surface p-4"
        >
          <Text className="text-xs font-bold uppercase text-brand">
            Active Service Offer
          </Text>
          <Text className="mt-1 text-base font-bold text-ink">
            {pendingOffer.serviceName} · Rs. {pendingOffer.pricePkr}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {pendingOffer.description}
          </Text>
          <Text className="mt-2 text-[11px] font-semibold text-amber-trust">
            Pay with Cash upon satisfactory completion
          </Text>
          {isProvider ? (
            <View className="mt-3">
              <Button
                title="Withdraw Offer"
                variant="secondary"
                onPress={() => {
                  void apiRequest(`/api/v1/offers/${pendingOffer.id}/withdraw`, {
                    method: "POST",
                    body: JSON.stringify({}),
                  }).then(() =>
                    queryClient.invalidateQueries({
                      queryKey: ["chat", "offers", conversationId],
                    })
                  );
                }}
              />
            </View>
          ) : (
            <View className="mt-3 gap-2">
              <TextInput
                value={serviceAddress}
                onChangeText={setServiceAddress}
                placeholder="Enter service address (3-300 chars) to accept"
                placeholderTextColor="#94A3B8"
                className="min-h-[44px] rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink"
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    title="Accept Offer"
                    variant="green"
                    onPress={() => void handleAcceptOffer(pendingOffer.id)}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title="Decline"
                    variant="secondary"
                    onPress={() => {
                      void apiRequest(`/api/v1/offers/${pendingOffer.id}/decline`, {
                        method: "POST",
                        body: JSON.stringify({}),
                      }).then(() =>
                        queryClient.invalidateQueries({
                          queryKey: ["chat", "offers", conversationId],
                        })
                      );
                    }}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      ) : null}

      <ScrollView className="flex-1 px-4 py-3">
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#0D16A8" />
          </View>
        ) : (
          <View className="gap-2.5 pb-4">
            {messages.map((m) => {
              const isMine = m.senderId === user?.id;
              return (
                <View
                  key={m.id}
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    isMine
                      ? "self-end bg-brand"
                      : "self-start border border-brand-tint-border bg-surface"
                  }`}
                >
                  {m.type === "IMAGE" && m.imageUrl ? (
                    <Image
                      source={{ uri: m.imageUrl }}
                      className="h-44 w-44 rounded-xl bg-canvas"
                    />
                  ) : (
                    <Text
                      className={`text-sm ${isMine ? "text-white" : "text-ink"}`}
                    >
                      {m.body}
                    </Text>
                  )}
                  <Text
                    className={`mt-1 text-[10px] ${
                      isMine ? "text-white/75" : "text-muted"
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {errorMsg ? (
        <View className="bg-danger-bg px-4 py-2">
          <Text className="text-xs font-medium text-danger">{errorMsg}</Text>
        </View>
      ) : null}

      {showAiAssist ? (
        <View className="border-t border-hairline bg-surface px-3 py-2.5">
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["summarize", "Summarize"],
                ["missing_info", "Missing Info"],
                ["clarify", "Clarify Questions"],
              ] as const
            ).map(([action, label]) => (
              <Pressable
                key={action}
                disabled={aiAssistBusy}
                onPress={() => {
                  setAiAssistBusy(true);
                  void apiRequest<AiChatAssistOutputDto>(
                    `/api/v1/ai/conversations/${conversationId}/assist`,
                    {
                      method: "POST",
                      body: JSON.stringify({ action }),
                    }
                  )
                    .then((res) => setAiAssistResult(res))
                    .catch(() => undefined)
                    .finally(() => setAiAssistBusy(false));
                }}
                className="min-h-[36px] flex-row items-center gap-1 rounded-xl border border-hairline bg-canvas px-3"
              >
                <Ionicons name="sparkles" size={12} color="#F59E0B" />
                <Text className="text-xs font-bold text-brand">{label}</Text>
              </Pressable>
            ))}
          </View>
          {aiAssistResult ? (
            <View className="mt-2 rounded-xl bg-brand-tint p-3">
              <Text className="text-xs text-ink">
                {aiAssistResult.resultText}
              </Text>
              {aiAssistResult.bulletPoints.map((b, idx) => (
                <Text key={idx} className="mt-1 text-xs text-muted">
                  • {b}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        className="flex-row items-center gap-2 border-t border-hairline bg-surface px-3 pt-2.5"
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      >
        <Pressable
          onPress={() => setShowAiAssist((v) => !v)}
          className="h-11 w-11 items-center justify-center rounded-xl bg-amber-tint"
        >
          <Ionicons name="sparkles" size={18} color="#F59E0B" />
        </Pressable>
        <Pressable
          onPress={() => void handleSendImage()}
          className="h-11 w-11 items-center justify-center rounded-xl bg-brand-tint"
        >
          <Ionicons name="image-outline" size={20} color="#0D16A8" />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a message..."
          placeholderTextColor="#94A3B8"
          className="min-h-[44px] flex-1 rounded-xl border border-hairline bg-canvas px-3.5 text-sm text-ink"
        />
        <Pressable
          onPress={() => void handleSendText()}
          disabled={sending || !text.trim()}
          className="h-11 w-11 items-center justify-center rounded-xl bg-brand disabled:opacity-50"
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal visible={showOfferModal} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="gap-3 rounded-t-3xl bg-surface p-6">
            <Text className="text-lg font-bold text-ink">
              Send Service Offer
            </Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={offerRawText}
                onChangeText={setOfferRawText}
                placeholder="Optional: paste plain text to pre-fill"
                placeholderTextColor="#94A3B8"
                className="min-h-[44px] flex-1 rounded-xl border border-hairline bg-canvas px-3 text-xs text-ink"
              />
              <Pressable
                disabled={aiOfferBusy || offerRawText.trim().length < 5}
                onPress={() => {
                  setAiOfferBusy(true);
                  void apiRequest<AiStructureOfferOutputDto>(
                    "/api/v1/ai/structure-offer",
                    {
                      method: "POST",
                      body: JSON.stringify({ rawText: offerRawText.trim() }),
                    }
                  )
                    .then((res) => {
                      if (res.serviceName) setOfferName(res.serviceName);
                      if (res.description) setOfferDesc(res.description);
                      if (res.pricePkr !== null)
                        setOfferPrice(String(res.pricePkr));
                    })
                    .catch(() => undefined)
                    .finally(() => setAiOfferBusy(false));
                }}
                className="min-h-[44px] flex-row items-center gap-1 rounded-xl border border-brand px-3 disabled:opacity-50"
              >
                <Ionicons name="sparkles" size={14} color="#0D16A8" />
                <Text className="text-xs font-bold text-brand">
                  {aiOfferBusy ? "..." : "AI Fill"}
                </Text>
              </Pressable>
            </View>
            <Input
              label="Service name"
              value={offerName}
              onChangeText={setOfferName}
              placeholder="e.g. Ceiling Fan Installation"
            />
            <Input
              label="Scope / description (min 10 chars)"
              value={offerDesc}
              onChangeText={setOfferDesc}
              multiline
            />
            <Input
              label="Price (whole PKR)"
              value={offerPrice}
              onChangeText={setOfferPrice}
              keyboardType="number-pad"
              placeholder="1500"
            />
            <Input
              label="Hours from now"
              value={offerHoursAhead}
              onChangeText={setOfferHoursAhead}
              keyboardType="number-pad"
            />
            <Button
              title="Send Offer"
              icon="send"
              onPress={() => void handleCreateOffer()}
            />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setShowOfferModal(false)}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
