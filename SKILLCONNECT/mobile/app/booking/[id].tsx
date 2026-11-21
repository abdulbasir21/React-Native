import { Ionicons } from "@expo/vector-icons";
import type { BookingDto, DisputeDto, ReviewDto } from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiRequest, MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { KeyboardAwareView } from "../../src/components/KeyboardAwareView";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { CARD_SHADOW } from "../../src/theme/tokens";

type BookingDetailResponse = BookingDto & { activeDispute: DisputeDto | null };

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [reasonText, setReasonText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittedReview, setSubmittedReview] = useState<ReviewDto | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const {
    data: booking,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["bookings", "detail", id],
    enabled: Boolean(id && user),
    queryFn: async () => {
      const res = await apiRequest<{ booking: BookingDetailResponse }>(
        `/api/v1/bookings/${id}`
      );
      return res.booking;
    },
  });

  const runAction = async (path: string, body: Record<string, unknown> = {}) => {
    setActionError(null);
    setBusy(true);
    try {
      await apiRequest(`/api/v1/bookings/${id}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setReasonText("");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["bookings", "my"] });
    } catch (err) {
      setActionError(
        err instanceof MobileApiError ? err.message : "Action failed"
      );
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !booking) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#0D16A8" />
        <Text className="mt-2 text-xs text-muted">Loading booking...</Text>
      </View>
    );
  }

  const isCustomer = booking.customerUserId === user?.id;
  const isAccused = booking.activeDispute?.accusedUserId === user?.id;

  return (
    <KeyboardAwareView hasHeader className="flex-1 bg-canvas">
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-canvas px-4 py-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
      <View style={CARD_SHADOW} className="rounded-3xl bg-surface p-5">
        <View className="flex-row items-center justify-between">
          <View className="rounded-full bg-brand-tint px-3 py-1">
            <Text className="text-xs font-bold uppercase text-brand">
              {booking.status.replace(/_/g, " ")}
            </Text>
          </View>
          <Text className="text-base font-bold text-location-dark">
            Rs. {booking.pricePkr}
          </Text>
        </View>

        <Text className="mt-3 text-xl font-bold text-ink">
          {booking.serviceName}
        </Text>
        <Text className="mt-1 text-xs font-semibold text-amber-trust">
          Cash on completion
        </Text>
        <Text className="mt-2.5 text-sm leading-5 text-muted">
          {booking.description}
        </Text>

        <View className="mt-3 flex-row items-center gap-1.5">
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text className="text-xs text-muted">
            Scheduled: {new Date(booking.scheduledStart).toLocaleString()}
          </Text>
        </View>
        {booking.serviceAddress ? (
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={14} color="#0D16A8" />
            <Text className="flex-1 text-xs font-semibold text-ink">
              {booking.serviceAddress}
            </Text>
          </View>
        ) : null}
      </View>

      {actionError ? (
        <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-danger-bg p-3.5">
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text className="flex-1 text-sm text-danger">{actionError}</Text>
        </View>
      ) : null}

      <View
        style={CARD_SHADOW}
        className="mt-4 gap-3 rounded-2xl bg-surface p-5"
      >
        <Text className="text-sm font-bold text-ink">Actions</Text>

        {booking.status === "CONFIRMED" && !isCustomer ? (
          <Button
            title="Mark Work Completed"
            variant="green"
            icon="checkmark-done"
            loading={busy}
            onPress={() => void runAction("/complete")}
          />
        ) : null}

        {booking.status === "PROVIDER_COMPLETED" && isCustomer ? (
          <Button
            title="Confirm Completion"
            variant="green"
            icon="checkmark-circle"
            loading={busy}
            onPress={() => void runAction("/confirm")}
          />
        ) : null}

        {(booking.status === "CONFIRMED" ||
          booking.status === "PROVIDER_COMPLETED") && (
          <TextInput
            value={reasonText}
            onChangeText={setReasonText}
            placeholder="Reason (required for cancel, no-show, or issue)"
            placeholderTextColor="#94A3B8"
            className="min-h-[44px] rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink"
          />
        )}

        {booking.status === "CONFIRMED" ? (
          <>
            <Button
              title="Cancel Booking"
              variant="secondary"
              icon="close-circle-outline"
              loading={busy}
              onPress={() => void runAction("/cancel", { reason: reasonText })}
            />
            <Button
              title="Report No-Show"
              variant="secondary"
              icon="alert-circle-outline"
              loading={busy}
              onPress={() => void runAction("/no-show", { reason: reasonText })}
            />
          </>
        ) : null}

        {booking.status === "PROVIDER_COMPLETED" && isCustomer ? (
          <Button
            title="Report Issue"
            variant="secondary"
            icon="warning-outline"
            loading={busy}
            onPress={() => void runAction("/issue", { reason: reasonText })}
          />
        ) : null}

        {booking.status === "NO_SHOW_REPORTED" && isAccused ? (
          <View className="gap-2">
            <TextInput
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Explain if disputing (min 10 chars)"
              placeholderTextColor="#94A3B8"
              className="min-h-[44px] rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink"
            />
            <Button
              title="Accept No-Show"
              loading={busy}
              onPress={() =>
                void runAction("/no-show/respond", { action: "accept" })
              }
            />
            <Button
              title="Dispute No-Show"
              variant="secondary"
              loading={busy}
              onPress={() =>
                void runAction("/no-show/respond", {
                  action: "dispute",
                  response: reasonText,
                })
              }
            />
          </View>
        ) : null}
      </View>

      {booking.status === "COMPLETED" && isCustomer ? (
        <View style={CARD_SHADOW} className="mt-4 rounded-2xl bg-surface p-5">
          <Text className="mb-2 text-sm font-bold text-ink">
            Leave a Review
          </Text>
          {submittedReview ? (
            <View className="gap-1">
              <Text className="text-sm font-bold text-brand">
                Submitted: {submittedReview.rating}/5 stars
              </Text>
              {submittedReview.comment ? (
                <Text className="text-sm text-muted">
                  {submittedReview.comment}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="gap-3">
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setReviewRating(star)}
                    className={`min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1 rounded-xl border ${
                      reviewRating === star
                        ? "border-brand bg-brand"
                        : "border-hairline bg-canvas"
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        reviewRating === star ? "text-white" : "text-ink"
                      }`}
                    >
                      {star}
                    </Text>
                    <Ionicons
                      name="star"
                      size={13}
                      color={reviewRating === star ? "#FBB03B" : "#F59E0B"}
                    />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
                placeholder="Optional comment about your experience"
                placeholderTextColor="#94A3B8"
                multiline
                className="min-h-[68px] rounded-xl border border-hairline bg-canvas p-3 text-sm text-ink"
              />
              <Button
                title="Submit Review"
                icon="star"
                loading={busy}
                onPress={() => {
                  setActionError(null);
                  setBusy(true);
                  void apiRequest<ReviewDto>(`/api/v1/bookings/${id}/review`, {
                    method: "POST",
                    body: JSON.stringify({
                      rating: reviewRating,
                      ...(reviewComment.trim()
                        ? { comment: reviewComment.trim() }
                        : {}),
                    }),
                  })
                    .then((created) => {
                      setSubmittedReview(created);
                      setReviewComment("");
                      void queryClient.invalidateQueries({
                        queryKey: [
                          "provider",
                          "reviews",
                          booking.providerProfileId,
                        ],
                      });
                    })
                    .catch((err) => {
                      setActionError(
                        err instanceof MobileApiError
                          ? err.message
                          : "Could not submit review"
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              />
            </View>
          )}
        </View>
      ) : null}

      {booking.history && booking.history.length > 0 ? (
        <View
          style={CARD_SHADOW}
          className="mb-10 mt-4 rounded-2xl bg-surface p-5"
        >
          <Text className="mb-2 text-sm font-bold text-ink">
            Status History
          </Text>
          <View className="gap-2">
            {booking.history.map((h) => (
              <Text key={h.id} className="text-xs text-muted">
                • {h.toStatus} ({h.actorType}) ·{" "}
                {new Date(h.createdAt).toLocaleString()}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
    </KeyboardAwareView>
  );
}
