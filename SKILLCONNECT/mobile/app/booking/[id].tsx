import type { BookingDto, DisputeDto, ReviewDto } from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiRequest, MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";

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
        <Text className="text-sm text-muted">Loading booking...</Text>
      </View>
    );
  }

  const isCustomer = booking.customerUserId === user?.id;
  const isAccused = booking.activeDispute?.accusedUserId === user?.id;

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      <View className="rounded-xl border border-hairline bg-surface p-5">
        <Text className="text-xs font-semibold uppercase text-brand">
          {booking.status}
        </Text>
        <Text className="mt-1 text-xl font-semibold text-ink">
          {booking.serviceName}
        </Text>
        <Text className="mt-1 text-base font-semibold text-ink">
          Rs. {booking.pricePkr} (Cash on completion)
        </Text>
        <Text className="mt-2 text-sm text-muted">{booking.description}</Text>
        <Text className="mt-3 text-xs text-muted">
          Scheduled: {new Date(booking.scheduledStart).toLocaleString()}
        </Text>
        {booking.serviceAddress ? (
          <Text className="mt-1 text-xs font-medium text-ink">
            Address: {booking.serviceAddress}
          </Text>
        ) : null}
      </View>

      {actionError ? (
        <View className="mt-3 rounded-xl bg-danger-bg p-3">
          <Text className="text-sm text-danger">{actionError}</Text>
        </View>
      ) : null}

      <View className="mt-4 gap-3 rounded-xl border border-hairline bg-surface p-4">
        <Text className="text-sm font-semibold text-ink">Actions</Text>

        {booking.status === "CONFIRMED" && !isCustomer ? (
          <Button
            title="Mark Work Completed"
            loading={busy}
            onPress={() => void runAction("/complete")}
          />
        ) : null}

        {booking.status === "PROVIDER_COMPLETED" && isCustomer ? (
          <Button
            title="Confirm Completion"
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
            placeholderTextColor="#9CA3AF"
            className="min-h-[44px] rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink"
          />
        )}

        {booking.status === "CONFIRMED" ? (
          <>
            <Button
              title="Cancel Booking"
              variant="secondary"
              loading={busy}
              onPress={() => void runAction("/cancel", { reason: reasonText })}
            />
            <Button
              title="Report No-Show"
              variant="secondary"
              loading={busy}
              onPress={() => void runAction("/no-show", { reason: reasonText })}
            />
          </>
        ) : null}

        {booking.status === "PROVIDER_COMPLETED" && isCustomer ? (
          <Button
            title="Report Issue"
            variant="secondary"
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
              placeholderTextColor="#9CA3AF"
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
        <View className="mt-4 rounded-xl border border-hairline bg-surface p-4">
          <Text className="mb-2 text-sm font-semibold text-ink">
            Leave a Review
          </Text>
          {submittedReview ? (
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">
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
                    className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                      reviewRating === star
                        ? "border-primary bg-primary"
                        : "border-hairline bg-canvas"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        reviewRating === star ? "text-white" : "text-ink"
                      }`}
                    >
                      {star}★
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                placeholder="Optional comment about your experience"
                placeholderTextColor="#9CA3AF"
                multiline
                className="min-h-[64px] rounded-xl border border-hairline bg-canvas p-3 text-sm text-ink"
              />
              <Button
                title="Submit Review"
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
                        queryKey: ["provider", "reviews", booking.providerProfileId],
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
        <View className="mb-8 mt-4 rounded-xl border border-hairline bg-surface p-4">
          <Text className="mb-2 text-sm font-semibold text-ink">
            Status History
          </Text>
          <View className="gap-2">
            {booking.history.map((h) => (
              <Text key={h.id} className="text-xs text-muted">
                {h.toStatus} ({h.actorType}) ·{" "}
                {new Date(h.createdAt).toLocaleString()}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
