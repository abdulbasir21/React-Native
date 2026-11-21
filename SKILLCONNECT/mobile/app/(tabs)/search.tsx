import { Ionicons } from "@expo/vector-icons";
import type {
  AiUnderstandOutputDto,
  CategoryDto,
  ProviderSearchResultDto,
  ProviderSearchSort,
} from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { CategoryIcon } from "../../src/components/CategoryIcon";
import { HeroHeader } from "../../src/components/HeroHeader";
import { LocationPill } from "../../src/components/LocationPill";
import { ProviderCard } from "../../src/components/ProviderCard";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";
import { CARD_SHADOW, SOFT_SHADOW } from "../../src/theme/tokens";

export default function SearchTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { location, serviceableDistrictLabel, useServiceableDistrict } =
    useLocationSelection();
  const { user } = useAuth();

  const [q, setQ] = useState("");
  const [aiProblem, setAiProblem] = useState("");
  const [aiResult, setAiResult] = useState<AiUnderstandOutputDto | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    string | undefined
  >(params.categoryId);
  const [availableNow, setAvailableNow] = useState(false);
  const [sort, setSort] = useState<ProviderSearchSort>("distance");

  useEffect(() => {
    if (params.categoryId) {
      setSelectedCategoryId(params.categoryId);
    }
  }, [params.categoryId]);

  const { data: categories = [] } = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: async () => {
      const res = await apiRequest<{ categories: CategoryDto[] }>(
        "/api/v1/categories"
      );
      return res.categories;
    },
  });

  const trimmedQ = q.trim();
  const validQ = trimmedQ.length >= 2 ? trimmedQ : undefined;

  const {
    data: providers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      "discovery",
      "search",
      location?.lat,
      location?.lng,
      selectedCategoryId,
      validQ,
      availableNow,
      sort,
    ],
    enabled: Boolean(location),
    queryFn: async () => {
      const sp = new URLSearchParams({
        lat: String(location!.lat),
        lng: String(location!.lng),
        sort,
        availableNow: String(availableNow),
      });
      if (selectedCategoryId) sp.set("categoryId", selectedCategoryId);
      if (validQ) sp.set("q", validQ);

      const res = await apiRequest<{ providers: ProviderSearchResultDto[] }>(
        `/api/v1/providers/search?${sp.toString()}`
      );
      return res.providers;
    },
  });

  const handleAiSuggest = async () => {
    const trimmed = aiProblem.trim();
    if (trimmed.length < 5 || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await apiRequest<AiUnderstandOutputDto>(
        "/api/v1/ai/understand",
        {
          method: "POST",
          body: JSON.stringify({ problemText: trimmed }),
        }
      );
      setAiResult(res);
      if (res.suggestedCategorySlug) {
        const matched = categories.find(
          (c) => c.slug === res.suggestedCategorySlug
        );
        if (matched) {
          setSelectedCategoryId(matched.id);
        }
      }
    } catch (err) {
      setAiError(
        err instanceof MobileApiError
          ? err.message
          : "Could not reach AI Trade Finder. Please try again."
      );
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <HeroHeader
        title="Find Technicians"
        subtitle="Filter by trade, availability, or describe your problem"
      >
        <LocationPill />
      </HeroHeader>

      <View className="-mt-3 rounded-t-[30px] bg-canvas px-4 pb-28 pt-5">
        {/* Search Bar */}
        <View
          style={CARD_SHADOW}
          className="min-h-[52px] flex-row items-center rounded-2xl bg-surface px-4"
        >
          <Ionicons name="search" size={20} color="#0D16A8" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by trade, service, or worker name"
            placeholderTextColor="#94A3B8"
            className="ml-2.5 flex-1 py-3 text-sm text-ink"
          />
          {q.length > 0 ? (
            <Pressable
              onPress={() => setQ("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              className="p-1.5"
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>

        {location?.outsideServiceArea ? (
          <View
            style={SOFT_SHADOW}
            className="mt-3 flex-row items-center justify-between rounded-2xl border border-amber-bright bg-amber-tint px-4 py-3"
          >
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold text-ink">
                Outside current service area
              </Text>
              <Text className="text-[11px] text-muted">
                Switch to {serviceableDistrictLabel} to browse active technicians.
              </Text>
            </View>
            <Pressable
              onPress={useServiceableDistrict}
              className="rounded-xl bg-amber-bright px-3 py-2"
            >
              <Text className="text-xs font-bold text-white">Switch</Text>
            </Pressable>
          </View>
        ) : null}

        {/* AI Trade Finder Card */}
        <View style={CARD_SHADOW} className="mt-4 rounded-2xl bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-amber-tint">
              <Ionicons name="sparkles" size={16} color="#F59E0B" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">
                Need help finding the right trade?
              </Text>
              <Text className="text-[11px] text-muted">
                Optional Gemini AI assistant
              </Text>
            </View>
          </View>

          {user ? (
            <>
              <View className="mt-3 flex-row gap-2">
                <TextInput
                  value={aiProblem}
                  onChangeText={setAiProblem}
                  placeholder="Describe your issue (e.g. AC leaking water)"
                  placeholderTextColor="#94A3B8"
                  className="min-h-[44px] flex-1 rounded-xl border border-hairline bg-canvas px-3 text-xs text-ink"
                />
                <Pressable
                  disabled={aiBusy || aiProblem.trim().length < 5}
                  onPress={() => void handleAiSuggest()}
                  className="min-h-[44px] flex-row items-center justify-center gap-1 rounded-xl bg-brand px-3.5 disabled:opacity-50"
                >
                  {aiBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                      <Text className="text-xs font-bold text-white">
                        Suggest
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              {aiError ? (
                <View className="mt-2.5 flex-row items-center gap-1.5 rounded-xl bg-danger-bg px-3 py-2">
                  <Ionicons name="alert-circle" size={15} color="#DC2626" />
                  <Text className="flex-1 text-xs font-medium text-danger">
                    {aiError}
                  </Text>
                </View>
              ) : null}

              {aiResult ? (
                <View className="mt-3 gap-2 rounded-xl bg-brand-tint p-3">
                  {aiResult.suggestedCategoryName ? (
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#0D16A8"
                      />
                      <Text className="text-xs font-bold text-brand">
                        Matched trade: {aiResult.suggestedCategoryName}
                      </Text>
                    </View>
                  ) : null}

                  {aiResult.searchKeywords.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5">
                      {aiResult.searchKeywords.map((kw, idx) => (
                        <Pressable
                          key={`${kw}-${idx}`}
                          onPress={() => setQ(kw)}
                          className="rounded-full bg-white px-2.5 py-1"
                        >
                          <Text className="text-[11px] font-semibold text-brand">
                            + {kw}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {aiResult.missingDetailsPrompts.map((p, idx) => (
                    <Text key={idx} className="text-xs text-ink">
                      • {p}
                    </Text>
                  ))}

                  <Text className="text-[11px] text-muted">
                    {aiResult.uncertaintyNote}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View className="mt-3">
              <Button
                title="Sign in to use AI Trade Finder"
                variant="secondary"
                icon="log-in-outline"
                onPress={() => router.push("/(auth)/login")}
              />
            </View>
          )}
        </View>

        {/* Horizontal Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4"
        >
          <View className="flex-row gap-2 py-1">
            <Pressable
              onPress={() => setSelectedCategoryId(undefined)}
              style={SOFT_SHADOW}
              className={`min-h-[40px] flex-row items-center gap-1.5 rounded-2xl px-3.5 ${
                !selectedCategoryId ? "bg-brand" : "bg-surface"
              }`}
            >
              <Ionicons
                name="apps"
                size={15}
                color={!selectedCategoryId ? "#FFFFFF" : "#0D16A8"}
              />
              <Text
                className={`text-xs font-bold ${
                  !selectedCategoryId ? "text-white" : "text-ink"
                }`}
              >
                All Trades
              </Text>
            </Pressable>

            {categories.map((cat) => {
              const active = selectedCategoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() =>
                    setSelectedCategoryId(active ? undefined : cat.id)
                  }
                  style={SOFT_SHADOW}
                  className={`min-h-[40px] flex-row items-center gap-2 rounded-2xl px-3 ${
                    active ? "bg-brand" : "bg-surface"
                  }`}
                >
                  <CategoryIcon
                    slug={cat.slug}
                    iconKey={cat.iconKey}
                    size="sm"
                  />
                  <Text
                    className={`text-xs font-bold ${
                      active ? "text-white" : "text-ink"
                    }`}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Filter & Sort Pills */}
        <View className="mt-3 flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => setAvailableNow((prev) => !prev)}
            style={SOFT_SHADOW}
            className={`min-h-[38px] flex-row items-center gap-1.5 rounded-full px-3.5 ${
              availableNow ? "bg-location-green" : "bg-surface"
            }`}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={availableNow ? "#FFFFFF" : "#38B420"}
            />
            <Text
              className={`text-xs font-bold ${
                availableNow ? "text-white" : "text-ink"
              }`}
            >
              Available now
            </Text>
          </Pressable>

          {(["distance", "rating"] as const).map((opt) => {
            const active = sort === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setSort(opt)}
                style={SOFT_SHADOW}
                className={`min-h-[38px] flex-row items-center gap-1.5 rounded-full px-3.5 ${
                  active ? "bg-brand" : "bg-surface"
                }`}
              >
                <Ionicons
                  name={opt === "distance" ? "navigate-outline" : "star-outline"}
                  size={14}
                  color={active ? "#FFFFFF" : "#0D16A8"}
                />
                <Text
                  className={`text-xs font-bold ${
                    active ? "text-white" : "text-ink"
                  }`}
                >
                  {opt === "distance" ? "Nearest" : "Top rated"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Results */}
        <View className="mt-5 gap-3">
          {isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator color="#0D16A8" />
              <Text className="mt-2 text-xs text-muted">
                Searching verified technicians...
              </Text>
            </View>
          ) : isError ? (
            <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-5">
              <Text className="text-sm font-medium text-danger">
                Could not search providers.
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
          ) : providers.length === 0 ? (
            <View
              style={CARD_SHADOW}
              className="items-center rounded-2xl bg-surface p-6"
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
                <Ionicons name="search-outline" size={26} color="#0D16A8" />
              </View>
              <Text className="mt-3 text-base font-bold text-ink">
                No providers matched
              </Text>
              <Text className="mt-1 text-center text-xs text-muted">
                Try clearing your search keyword, removing filters, or switching
                location.
              </Text>
              {validQ || selectedCategoryId || availableNow ? (
                <View className="mt-4 w-full">
                  <Button
                    title="Reset Filters"
                    variant="secondary"
                    icon="refresh"
                    onPress={() => {
                      setQ("");
                      setSelectedCategoryId(undefined);
                      setAvailableNow(false);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            providers.map((prov) => (
              <ProviderCard
                key={prov.id}
                provider={prov}
                onPress={() => router.push(`/provider/${prov.id}`)}
              />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
