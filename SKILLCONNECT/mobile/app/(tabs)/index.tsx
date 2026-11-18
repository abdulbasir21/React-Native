import type { CategoryDto, ProviderSearchResultDto } from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { apiRequest } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ProviderCard } from "../../src/components/ProviderCard";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";
import { STRINGS } from "../../src/strings/en";

export default function HomeTab() {
  const { user } = useAuth();
  const { location, serviceableDistrictLabel } = useLocationSelection();
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

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      <Pressable
        onPress={() => router.push("/location")}
        className="min-h-[48px] flex-row items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3"
      >
        <View>
          <Text className="text-xs font-medium text-muted">Current Area</Text>
          <Text className="text-sm font-semibold text-ink">
            {location?.label ?? STRINGS.location.selectLocalityPlaceholder}
          </Text>
        </View>
        <Text className="text-xs font-semibold text-brand">Change</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/search")}
        className="mt-3 min-h-[48px] justify-center rounded-xl border border-hairline bg-surface px-4"
      >
        <Text className="text-sm text-placeholder">
          Search electricians, plumbers, solar technicians...
        </Text>
      </Pressable>

      {location?.outsideServiceArea ? (
        <View className="mt-3 rounded-xl border border-amber-trust bg-surface p-4">
          <Text className="text-sm font-semibold text-amber-trust">
            {STRINGS.location.outsideAreaTitle}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {STRINGS.location.outsideAreaPrefix}
            {serviceableDistrictLabel}.
          </Text>
        </View>
      ) : null}

      <View className="mt-5">
        <Text className="mb-3 text-base font-semibold text-ink">
          {STRINGS.home.categoriesHeading}
        </Text>
        {isLoadingCats ? (
          <Text className="text-sm text-muted">
            {STRINGS.home.loadingCategories}
          </Text>
        ) : isErrorCats ? (
          <View className="rounded-xl border border-hairline bg-surface p-4">
            <Text className="text-sm text-danger">
              {STRINGS.home.errorCategories}
            </Text>
            <View className="mt-3">
              <Button
                title={STRINGS.home.retry}
                variant="secondary"
                onPress={() => void refetchCats()}
              />
            </View>
          </View>
        ) : categories.length === 0 ? (
          <Text className="text-sm text-muted">
            {STRINGS.home.emptyCategories}
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/search",
                    params: { categoryId: cat.id },
                  })
                }
                className="min-h-[44px] justify-center rounded-xl border border-hairline bg-surface px-3.5 py-2"
              >
                <Text className="text-xs font-semibold text-ink">
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View className="mt-6">
        <Text className="mb-3 text-base font-semibold text-ink">
          Nearby verified professionals
        </Text>
        {isLoadingNearby ? (
          <Text className="text-sm text-muted">Finding nearby providers...</Text>
        ) : isErrorNearby ? (
          <View className="rounded-xl border border-hairline bg-surface p-4">
            <Text className="text-sm text-danger">
              Could not load nearby providers.
            </Text>
            <View className="mt-3">
              <Button
                title={STRINGS.home.retry}
                variant="secondary"
                onPress={() => void refetchNearby()}
              />
            </View>
          </View>
        ) : nearbyProviders.length === 0 ? (
          <View className="rounded-xl border border-hairline bg-surface p-4">
            <Text className="text-sm text-muted">
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

      <View className="mb-8 mt-6 rounded-xl border border-hairline bg-surface p-5">
        <Text className="text-base font-semibold text-ink">
          {user?.roles.includes("PROVIDER")
            ? "Manage your provider profile"
            : "Offer your skills on SkillConnect"}
        </Text>
        <Text className="mt-1 text-sm text-muted">
          {user
            ? "Update your trades, availability, and service radius."
            : "Sign in to chat with technicians or register as a provider."}
        </Text>
        <View className="mt-4">
          <Button
            title={
              user ? "Open Provider Area" : STRINGS.auth.signInButton
            }
            variant="secondary"
            onPress={() =>
              router.push(user ? "/become-provider" : "/(auth)/login")
            }
          />
        </View>
      </View>
    </ScrollView>
  );
}
