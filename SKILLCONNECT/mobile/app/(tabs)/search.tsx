import type {
  AiUnderstandOutputDto,
  CategoryDto,
  ProviderSearchResultDto,
  ProviderSearchSort,
} from "@skillconnect/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiRequest } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ProviderCard } from "../../src/components/ProviderCard";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useLocationSelection } from "../../src/features/location/LocationContext";

export default function SearchTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { location } = useLocationSelection();
  const { user } = useAuth();

  const [q, setQ] = useState("");
  const [aiProblem, setAiProblem] = useState("");
  const [aiResult, setAiResult] = useState<AiUnderstandOutputDto | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    params.categoryId
  );
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

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-4">
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search by trade, service, or provider name"
        placeholderTextColor="#9CA3AF"
        className="min-h-[48px] rounded-xl border border-hairline bg-surface px-4 text-sm text-ink"
      />

      {user ? (
        <View className="mt-3 rounded-xl border border-hairline bg-surface p-3">
          <Text className="text-xs font-semibold text-muted">
            Need help finding the right trade? (Optional AI)
          </Text>
          <View className="mt-2 flex-row gap-2">
            <TextInput
              value={aiProblem}
              onChangeText={setAiProblem}
              placeholder="Describe your issue (e.g. AC leaking water)"
              placeholderTextColor="#9CA3AF"
              className="min-h-[44px] flex-1 rounded-xl border border-hairline bg-canvas px-3 text-xs text-ink"
            />
            <Pressable
              disabled={aiBusy || aiProblem.trim().length < 5}
              onPress={() => {
                setAiBusy(true);
                void apiRequest<AiUnderstandOutputDto>("/api/v1/ai/understand", {
                  method: "POST",
                  body: JSON.stringify({ problemText: aiProblem.trim() }),
                })
                  .then((res) => {
                    setAiResult(res);
                    if (res.suggestedCategorySlug) {
                      const matched = categories.find(
                        (c) => c.slug === res.suggestedCategorySlug
                      );
                      if (matched) setSelectedCategoryId(matched.id);
                    }
                    if (!q.trim() && res.searchKeywords[0]) {
                      setQ(res.searchKeywords[0]);
                    }
                  })
                  .catch(() => undefined)
                  .finally(() => setAiBusy(false));
              }}
              className="min-h-[44px] items-center justify-center rounded-xl bg-brand px-3 disabled:opacity-50"
            >
              <Text className="text-xs font-semibold text-white">
                {aiBusy ? "..." : "Suggest"}
              </Text>
            </Pressable>
          </View>
          {aiResult ? (
            <View className="mt-2 gap-1">
              {aiResult.suggestedCategoryName ? (
                <Text className="text-xs font-semibold text-brand">
                  Suggested: {aiResult.suggestedCategoryName}
                </Text>
              ) : null}
              {aiResult.missingDetailsPrompts.map((p, idx) => (
                <Text key={idx} className="text-xs text-muted">
                  • {p}
                </Text>
              ))}
              <Text className="text-[11px] text-muted">
                {aiResult.uncertaintyNote}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
      >
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setSelectedCategoryId(undefined)}
            className={`min-h-[36px] justify-center rounded-full border px-3.5 ${
              !selectedCategoryId
                ? "border-brand bg-brand-tint"
                : "border-hairline bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                !selectedCategoryId ? "text-brand" : "text-muted"
              }`}
            >
              All
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
                className={`min-h-[36px] justify-center rounded-full border px-3.5 ${
                  active
                    ? "border-brand bg-brand-tint"
                    : "border-hairline bg-surface"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-brand" : "text-muted"
                  }`}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="mt-3 flex-row flex-wrap gap-2">
        <Pressable
          onPress={() => setAvailableNow((prev) => !prev)}
          className={`min-h-[36px] justify-center rounded-full border px-3.5 ${
            availableNow
              ? "border-brand bg-brand-tint"
              : "border-hairline bg-surface"
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              availableNow ? "text-brand" : "text-muted"
            }`}
          >
            Available now
          </Text>
        </Pressable>

        {(["distance", "rating"] as const).map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setSort(opt)}
            className={`min-h-[36px] justify-center rounded-full border px-3.5 ${
              sort === opt
                ? "border-brand bg-brand-tint"
                : "border-hairline bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                sort === opt ? "text-brand" : "text-muted"
              }`}
            >
              Sort: {opt === "distance" ? "Nearest" : "Top rated"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-8 mt-4 gap-3">
        {isLoading ? (
          <Text className="text-sm text-muted">Searching providers...</Text>
        ) : isError ? (
          <View className="rounded-xl border border-hairline bg-surface p-4">
            <Text className="text-sm text-danger">
              Could not load search results.
            </Text>
            <View className="mt-3">
              <Button
                title="Retry"
                variant="secondary"
                onPress={() => void refetch()}
              />
            </View>
          </View>
        ) : providers.length === 0 ? (
          <View className="rounded-xl border border-hairline bg-surface p-6">
            <Text className="text-base font-semibold text-ink">
              No matching providers
            </Text>
            <Text className="mt-1 text-sm text-muted">
              Try clearing filters or selecting a different area.
            </Text>
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
    </ScrollView>
  );
}
