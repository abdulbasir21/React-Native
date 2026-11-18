import type {
  ProviderReviewsResponseDto,
  PublicProviderProfileDto,
  TravelEstimateDto,
} from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, ScrollView, Text, View } from "react-native";
import { apiRequest, MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PublicProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { location } = useLocationSelection();

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["provider", "public", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiRequest<{ profile: PublicProviderProfileDto }>(
        `/api/v1/providers/${id}`
      );
      return res.profile;
    },
  });

  const { data: reviewsData } = useQuery({
    queryKey: ["provider", "reviews", id],
    enabled: Boolean(id && profile),
    queryFn: async () => {
      return apiRequest<ProviderReviewsResponseDto>(
        `/api/v1/providers/${id}/reviews`
      );
    },
  });

  const { data: travelEstimate } = useQuery({
    queryKey: ["routes", "estimate", id, location?.lat, location?.lng],
    enabled: Boolean(id && profile && location),
    queryFn: async () => {
      const sp = new URLSearchParams({
        providerProfileId: String(id),
        originLat: String(location!.lat),
        originLng: String(location!.lng),
      });
      const res = await apiRequest<{ estimate: TravelEstimateDto | null }>(
        `/api/v1/routes/estimate?${sp.toString()}`
      );
      return res.estimate;
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-sm text-muted">Loading profile...</Text>
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-base font-semibold text-danger">
          {error instanceof MobileApiError && error.status === 404
            ? "Provider profile not available"
            : "Could not load profile"}
        </Text>
        <View className="mt-4 w-full">
          <Button title="Retry" variant="secondary" onPress={() => void refetch()} />
        </View>
      </View>
    );
  }

  const isOwnProfile = user?.id === profile.userId;

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      <View className="rounded-xl border border-hairline bg-surface p-5">
        <View className="flex-row items-center gap-4">
          {profile.photoUrl ? (
            <Image
              source={{ uri: profile.photoUrl }}
              className="h-20 w-20 rounded-xl bg-canvas"
            />
          ) : (
            <View className="h-20 w-20 items-center justify-center rounded-xl bg-brand-tint">
              <Text className="text-2xl font-bold text-brand">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-xl font-semibold text-ink">
              {profile.displayName}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              <View className="rounded-full bg-brand-tint px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-brand">
                  Verified Provider
                </Text>
              </View>
              <Text className="text-xs font-semibold text-amber-trust">
                {profile.averageRating !== null
                  ? `★ ${profile.averageRating.toFixed(1)} (${profile.reviewCount})`
                  : "New"}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-muted">
              {profile.experienceYears ?? 0} yrs experience
              {profile.serviceArea
                ? ` · ${profile.serviceArea.localityName} (${profile.serviceArea.radiusKm} km area)`
                : ""}
            </Text>
            {travelEstimate ? (
              <Text className="mt-0.5 text-xs font-medium text-brand">
                Est. drive: {travelEstimate.durationLabel} (
                {travelEstimate.distanceLabel})
              </Text>
            ) : null}
          </View>
        </View>

        {profile.description ? (
          <Text className="mt-4 text-sm leading-5 text-ink">
            {profile.description}
          </Text>
        ) : null}

        {!isOwnProfile ? (
          <View className="mt-5">
            <Button
              title="Message Worker"
              onPress={() => {
                if (!user) {
                  router.push("/(auth)/login");
                  return;
                }
                void apiRequest<{ conversation: { id: string } }>(
                  "/api/v1/conversations",
                  {
                    method: "POST",
                    body: JSON.stringify({ providerProfileId: profile.id }),
                  }
                ).then((res) => {
                  router.push(`/chat/${res.conversation.id}`);
                });
              }}
            />
          </View>
        ) : null}
      </View>

      <View className="mt-4 rounded-xl border border-hairline bg-surface p-5">
        <Text className="text-base font-semibold text-ink">Services</Text>
        {profile.services.length === 0 ? (
          <Text className="mt-2 text-sm text-muted">No active services.</Text>
        ) : (
          <View className="mt-3 gap-3">
            {profile.services.map((s) => (
              <View
                key={s.id}
                className="rounded-xl border border-hairline p-3"
              >
                <Text className="text-xs font-semibold text-brand">
                  {s.categoryName}
                </Text>
                <Text className="mt-0.5 text-sm font-semibold text-ink">
                  {s.title}
                </Text>
                <Text className="mt-1 text-xs text-muted">{s.description}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="mt-4 rounded-xl border border-hairline bg-surface p-5">
        <Text className="text-base font-semibold text-ink">
          Availability (Asia/Karachi)
        </Text>
        {!profile.isAcceptingWork ? (
          <Text className="mt-2 text-sm text-muted">
            Currently not accepting new requests.
          </Text>
        ) : profile.availability.length === 0 ? (
          <Text className="mt-2 text-sm text-muted">
            Available every day (flexible hours).
          </Text>
        ) : (
          <View className="mt-2 gap-1.5">
            {profile.availability.map((w) => (
              <Text key={w.id} className="text-sm text-ink">
                {DAY_NAMES[w.dayOfWeek]}: {w.startTime} – {w.endTime}
              </Text>
            ))}
          </View>
        )}
      </View>

      {profile.portfolio.length > 0 ? (
        <View className="mt-4 rounded-xl border border-hairline bg-surface p-5">
          <Text className="mb-3 text-base font-semibold text-ink">
            Work Portfolio
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {profile.portfolio.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.imageUrl }}
                className="h-24 w-24 rounded-xl bg-canvas"
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="mb-8 mt-4 rounded-xl border border-hairline bg-surface p-5">
        <Text className="mb-3 text-base font-semibold text-ink">
          Reviews{" "}
          {reviewsData && reviewsData.reviewCount > 0
            ? `(${reviewsData.averageRating ?? "—"} ★ · ${reviewsData.reviewCount})`
            : ""}
        </Text>
        {!reviewsData || reviewsData.reviews.length === 0 ? (
          <Text className="text-sm text-muted">No reviews yet.</Text>
        ) : (
          <View className="gap-3">
            {reviewsData.reviews.map((rev) => (
              <View
                key={rev.id}
                className="rounded-xl border border-hairline bg-canvas p-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-ink">
                    {rev.customerName}
                  </Text>
                  <Text className="text-sm font-semibold text-primary">
                    {rev.rating} ★
                  </Text>
                </View>
                {rev.comment ? (
                  <Text className="mt-1 text-sm text-ink">{rev.comment}</Text>
                ) : null}
                <Text className="mt-1 text-xs text-muted">
                  {new Date(rev.createdAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
