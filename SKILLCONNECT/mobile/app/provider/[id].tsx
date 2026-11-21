import { Ionicons } from "@expo/vector-icons";
import type {
  ProviderReviewsResponseDto,
  PublicProviderProfileDto,
  TravelEstimateDto,
} from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { apiRequest, MobileApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";
import { CARD_SHADOW } from "../../src/theme/tokens";

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
        <ActivityIndicator color="#0D16A8" />
        <Text className="mt-2 text-xs text-muted">Loading profile...</Text>
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-base font-bold text-danger">
          {error instanceof MobileApiError && error.status === 404
            ? "Provider profile not available"
            : "Could not load profile"}
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

  const isOwnProfile = user?.id === profile.userId;

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-5">
      <View style={CARD_SHADOW} className="rounded-3xl bg-surface p-5">
        <View className="flex-row items-center gap-4">
          {profile.photoUrl ? (
            <Image
              source={{ uri: profile.photoUrl }}
              className="h-20 w-20 rounded-full bg-brand-tint"
            />
          ) : (
            <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-tint">
              <Text className="text-2xl font-bold text-brand">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="flex-shrink text-xl font-bold text-ink">
                {profile.displayName}
              </Text>
              <Ionicons name="shield-checkmark" size={18} color="#0D16A8" />
            </View>

            <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5">
                <Ionicons name="checkmark-circle" size={12} color="#0D16A8" />
                <Text className="text-xs font-bold text-brand">
                  Verified Provider
                </Text>
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-amber-tint px-2.5 py-0.5">
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text className="text-xs font-bold text-amber-trust">
                  {profile.averageRating !== null
                    ? `${profile.averageRating.toFixed(1)} (${profile.reviewCount})`
                    : "New"}
                </Text>
              </View>
            </View>

            <Text className="mt-1.5 text-xs text-muted">
              {profile.experienceYears ?? 0} yrs experience
              {profile.serviceArea
                ? ` · ${profile.serviceArea.localityName} (${profile.serviceArea.radiusKm} km area)`
                : ""}
            </Text>

            {travelEstimate ? (
              <View className="mt-1 flex-row items-center gap-1">
                <Ionicons name="car-outline" size={13} color="#2A8F17" />
                <Text className="text-xs font-bold text-location-dark">
                  Est. drive: {travelEstimate.durationLabel} (
                  {travelEstimate.distanceLabel})
                </Text>
              </View>
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
              icon="chatbubbles-outline"
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

      <View style={CARD_SHADOW} className="mt-4 rounded-2xl bg-surface p-5">
        <View className="flex-row items-center gap-2">
          <Ionicons name="construct-outline" size={18} color="#0D16A8" />
          <Text className="text-base font-bold text-ink">Services</Text>
        </View>
        {profile.services.length === 0 ? (
          <Text className="mt-2 text-sm text-muted">No active services.</Text>
        ) : (
          <View className="mt-3 gap-2.5">
            {profile.services.map((s) => (
              <View key={s.id} className="rounded-xl bg-canvas p-3.5">
                <Text className="text-xs font-bold text-brand">
                  {s.categoryName}
                </Text>
                <Text className="mt-0.5 text-sm font-bold text-ink">
                  {s.title}
                </Text>
                <Text className="mt-1 text-xs leading-4 text-muted">
                  {s.description}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={CARD_SHADOW} className="mt-4 rounded-2xl bg-surface p-5">
        <View className="flex-row items-center gap-2">
          <Ionicons name="time-outline" size={18} color="#38B420" />
          <Text className="text-base font-bold text-ink">
            Availability (Asia/Karachi)
          </Text>
        </View>
        {!profile.isAcceptingWork ? (
          <Text className="mt-2 text-sm text-muted">
            Currently not accepting new requests.
          </Text>
        ) : profile.availability.length === 0 ? (
          <Text className="mt-2 text-sm text-muted">
            Available every day (flexible hours).
          </Text>
        ) : (
          <View className="mt-3 gap-1.5">
            {profile.availability.map((w) => (
              <Text key={w.id} className="text-sm text-ink">
                {DAY_NAMES[w.dayOfWeek]}: {w.startTime} – {w.endTime}
              </Text>
            ))}
          </View>
        )}
      </View>

      {profile.portfolio.length > 0 ? (
        <View style={CARD_SHADOW} className="mt-4 rounded-2xl bg-surface p-5">
          <View className="mb-3 flex-row items-center gap-2">
            <Ionicons name="images-outline" size={18} color="#0D16A8" />
            <Text className="text-base font-bold text-ink">Work Portfolio</Text>
          </View>
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

      <View
        style={CARD_SHADOW}
        className="mb-10 mt-4 rounded-2xl bg-surface p-5"
      >
        <View className="mb-3 flex-row items-center gap-2">
          <Ionicons name="star" size={18} color="#F59E0B" />
          <Text className="text-base font-bold text-ink">
            Reviews{" "}
            {reviewsData && reviewsData.reviewCount > 0
              ? `(${reviewsData.averageRating ?? "—"} ★ · ${reviewsData.reviewCount})`
              : ""}
          </Text>
        </View>
        {!reviewsData || reviewsData.reviews.length === 0 ? (
          <Text className="text-sm text-muted">No reviews yet.</Text>
        ) : (
          <View className="gap-3">
            {reviewsData.reviews.map((rev) => (
              <View key={rev.id} className="rounded-xl bg-canvas p-3.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-ink">
                    {rev.customerName}
                  </Text>
                  <View className="flex-row items-center gap-1 rounded-full bg-amber-tint px-2 py-0.5">
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text className="text-xs font-bold text-amber-trust">
                      {rev.rating}
                    </Text>
                  </View>
                </View>
                {rev.comment ? (
                  <Text className="mt-1.5 text-sm text-ink">{rev.comment}</Text>
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
