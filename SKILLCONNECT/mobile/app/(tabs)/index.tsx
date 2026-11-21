import { Ionicons } from "@expo/vector-icons";
import type { CategoryDto, ProviderSearchResultDto } from "@skillconnect/shared";
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
import { Button } from "../../src/components/Button";
import { CategoryIcon } from "../../src/components/CategoryIcon";
import { HeroHeader } from "../../src/components/HeroHeader";
import { LocationPill } from "../../src/components/LocationPill";
import { ProviderCard } from "../../src/components/ProviderCard";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";
import { STRINGS } from "../../src/strings/en";
import { CARD_SHADOW, SOFT_SHADOW } from "../../src/theme/tokens";

export default function HomeTab() {
  const { user } = useAuth();
  const { location, serviceableDistrictLabel, useServiceableDistrict } =
    useLocationSelection();
  const router = useRouter();

  const {
    data: categories = [],
    isLoading: isLoadingCats,
    isError: isErrorCats,
    refetch: refetchCats,
  } = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: async () => {
      const res = await apiRequest<{ categories: CategoryDto[] }>(
        "/api/v1/categories"
      );
      return res.categories;
    },
  });

  const {
    data: nearbyProviders = [],
    isLoading: isLoadingNearby,
    isError: isErrorNearby,
    refetch: refetchNearby,
  } = useQuery({
    queryKey: ["discovery", "home", location?.lat, location?.lng],
    enabled: Boolean(location),
    queryFn: async () => {
      const res = await apiRequest<{ providers: ProviderSearchResultDto[] }>(
        `/api/v1/providers/search?lat=${location!.lat}&lng=${location!.lng}&limit=10`
      );
      return res.providers;
    },
  });

  const greeting = user
    ? `Welcome back, ${user.fullName.split(" ")[0]}`
    : "Trusted local technicians near you";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
    >
      <HeroHeader title="SkillConnect" subtitle={greeting}>
        <LocationPill />
      </HeroHeader>

      <View className="-mt-3 rounded-t-[30px] bg-canvas px-4 pb-28 pt-5">
        {/* Floating Search Bar Trigger */}
        <Pressable
          onPress={() => router.push("/(tabs)/search")}
          accessibilityRole="button"
          accessibilityLabel="Search electricians, plumbers, or describe your problem"
          style={CARD_SHADOW}
          className="min-h-[54px] flex-row items-center justify-between rounded-2xl bg-surface px-4 py-2.5 active:bg-brand-tint"
        >
          <View className="flex-1 flex-row items-center gap-3 pr-2">
            <Ionicons name="search" size={20} color="#0D16A8" />
            <Text numberOfLines={1} className="flex-1 text-sm text-placeholder">
              Search trades or describe your issue...
            </Text>
          </View>
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-sky-tint">
            <Ionicons name="options-outline" size={18} color="#0284C7" />
          </View>
        </Pressable>

        {/* Outside Service Area Banner with 1-tap Browse Fallback */}
        {location?.outsideServiceArea ? (
          <View
            style={SOFT_SHADOW}
            className="mt-4 rounded-2xl border border-amber-bright bg-amber-tint p-4"
          >
            <View className="flex-row items-start gap-2.5">
              <Ionicons name="alert-circle" size={20} color="#B45309" />
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">
                  {STRINGS.location.outsideAreaTitle}
                </Text>
                <Text className="mt-1 text-xs leading-4 text-muted">
                  {STRINGS.location.outsideAreaPrefix}
                  {serviceableDistrictLabel}.
                </Text>
              </View>
            </View>
            <View className="mt-3">
              <Button
                title={`Browse ${serviceableDistrictLabel}`}
                variant="amber"
                icon="compass-outline"
                onPress={useServiceableDistrict}
              />
            </View>
          </View>
        ) : null}

        {/* Service Categories — 2-Column Square Tile Grid matching reference */}
        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-bold text-ink">
              {STRINGS.home.categoriesHeading}
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/search")}
              className="flex-row items-center gap-1 py-1"
            >
              <Text className="text-xs font-bold text-brand">See all</Text>
              <Ionicons name="chevron-forward" size={14} color="#0D16A8" />
            </Pressable>
          </View>

          {isLoadingCats ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#0D16A8" />
              <Text className="mt-2 text-xs text-muted">
                {STRINGS.home.loadingCategories}
              </Text>
            </View>
          ) : isErrorCats ? (
            <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-4">
              <Text className="text-sm font-medium text-danger">
                {STRINGS.home.errorCategories}
              </Text>
              <View className="mt-3">
                <Button
                  title={STRINGS.home.retry}
                  variant="secondary"
                  icon="refresh"
                  onPress={() => void refetchCats()}
                />
              </View>
            </View>
          ) : categories.length === 0 ? (
            <Text className="text-sm text-muted">
              {STRINGS.home.emptyCategories}
            </Text>
          ) : (
            <View className="flex-row flex-wrap justify-between gap-y-3">
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/search",
                      params: { categoryId: cat.id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={cat.name}
                  style={CARD_SHADOW}
                  className="w-[48%] items-center justify-center rounded-2xl bg-surface px-3 py-5 active:bg-brand-tint"
                >
                  <CategoryIcon
                    slug={cat.slug}
                    iconKey={cat.iconKey}
                    size="lg"
                  />
                  <Text
                    numberOfLines={1}
                    className="mt-3 text-center text-sm font-bold text-ink"
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* AI Trade Finder Banner */}
        <Pressable
          onPress={() => router.push("/(tabs)/search")}
          style={CARD_SHADOW}
          className="mt-6 flex-row items-center gap-3.5 rounded-2xl bg-amber-bright p-4 active:opacity-90"
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/25">
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-white">
              Not sure who to call? Ask AI Trade Finder
            </Text>
            <Text className="mt-0.5 text-xs text-white/90">
              Describe your issue and we&apos;ll match the right technician.
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Nearby Verified Professionals */}
        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-bold text-ink">
              Nearby Verified Professionals
            </Text>
            <Text className="text-xs font-semibold text-muted">
              {nearbyProviders.length} found
            </Text>
          </View>

          {isLoadingNearby ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#0D16A8" />
              <Text className="mt-2 text-xs text-muted">
                Finding nearby providers...
              </Text>
            </View>
          ) : isErrorNearby ? (
            <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-4">
              <Text className="text-sm text-danger">
                Could not load nearby providers.
              </Text>
              <View className="mt-3">
                <Button
                  title={STRINGS.home.retry}
                  variant="secondary"
                  icon="refresh"
                  onPress={() => void refetchNearby()}
                />
              </View>
            </View>
          ) : nearbyProviders.length === 0 ? (
            <View
              style={CARD_SHADOW}
              className="items-center rounded-2xl bg-surface p-5"
            >
              <Ionicons name="search-outline" size={28} color="#94A3B8" />
              <Text className="mt-2 text-center text-sm font-medium text-muted">
                No approved providers found near this location yet.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {nearbyProviders.map((prov) => (
                <ProviderCard
                  key={prov.id}
                  provider={prov}
                  onPress={() => router.push(`/provider/${prov.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Provider Onboarding / Management Card */}
        <View
          style={CARD_SHADOW}
          className="mt-6 rounded-2xl bg-surface p-5"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint">
              <Ionicons name="briefcase" size={22} color="#0D16A8" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">
                {user?.roles.includes("PROVIDER")
                  ? "Manage your provider profile"
                  : "Offer your skills on SkillConnect"}
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                {user
                  ? "Update your trades, availability, and service radius."
                  : "Sign in to chat with technicians or register as a provider."}
              </Text>
            </View>
          </View>
          <View className="mt-4">
            <Button
              title={user ? "Open Provider Area" : STRINGS.auth.signInButton}
              variant="secondary"
              icon={user ? "settings-outline" : "log-in-outline"}
              onPress={() =>
                router.push(user ? "/become-provider" : "/(auth)/login")
              }
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
