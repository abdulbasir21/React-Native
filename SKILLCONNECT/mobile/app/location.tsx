import { Ionicons } from "@expo/vector-icons";
import type {
  PlaceDetailsDto,
  PlaceSuggestionDto,
} from "@skillconnect/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiRequest } from "../src/api/client";
import { Button } from "../src/components/Button";
import { KeyboardAwareView } from "../src/components/KeyboardAwareView";
import { useLocationSelection } from "../src/features/location/LocationContext";
import { STRINGS } from "../src/strings/en";
import { CARD_SHADOW, SOFT_SHADOW } from "../src/theme/tokens";

export default function LocationPickerScreen() {
  const router = useRouter();
  const {
    location,
    localities,
    isLoadingLocalities,
    isDetectingGps,
    serviceableDistrictLabel,
    selectCoordinates,
    selectLocality,
    detectPhoneLocation,
  } = useLocationSelection();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestionDto[]>([]);
  const [placeFallback, setPlaceFallback] = useState(false);

  const handlePlaceSearch = async (text: string) => {
    setPlaceQuery(text);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const sp = new URLSearchParams({ q: text.trim() });
      if (location) {
        sp.set("lat", String(location.lat));
        sp.set("lng", String(location.lng));
      }
      const res = await apiRequest<{
        suggestions: PlaceSuggestionDto[];
        fallbackToManual: boolean;
      }>(`/api/v1/places/autocomplete?${sp.toString()}`);
      setSuggestions(res.suggestions);
      setPlaceFallback(res.fallbackToManual);
    } catch {
      setSuggestions([]);
      setPlaceFallback(true);
    }
  };

  const handleSelectPlace = async (item: PlaceSuggestionDto) => {
    try {
      const res = await apiRequest<{
        place: PlaceDetailsDto | null;
        fallbackToManual: boolean;
      }>(`/api/v1/places/details?placeId=${encodeURIComponent(item.placeId)}`);
      if (res.place) {
        await selectCoordinates(
          res.place.lat,
          res.place.lng,
          res.place.name,
          "manual"
        );
        router.back();
        return;
      }
      setPlaceFallback(true);
    } catch {
      setPlaceFallback(true);
    }
  };

  const handleUseGps = async () => {
    setErrorMsg(null);
    const ok = await detectPhoneLocation();
    if (ok) {
      router.back();
    } else {
      setErrorMsg(STRINGS.location.permissionDenied);
    }
  };

  const districts = localities.filter((l) => l.level === "DISTRICT");
  const childLocalities = localities.filter((l) => l.level === "LOCALITY");

  return (
    <KeyboardAwareView hasHeader className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1 bg-canvas px-4 py-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
      <View style={CARD_SHADOW} className="rounded-2xl bg-surface p-5">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-location-tint">
            <Ionicons name="locate" size={22} color="#2A8F17" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-ink">
              {STRINGS.location.title}
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              {STRINGS.location.subtitle}
            </Text>
          </View>
        </View>

        <View className="mt-4">
          <Button
            title={
              isDetectingGps
                ? STRINGS.location.checkingGps
                : STRINGS.location.useGpsButton
            }
            variant="green"
            icon="locate"
            loading={isDetectingGps}
            onPress={() => void handleUseGps()}
          />
        </View>
      </View>

      <View className="mt-4">
        <View
          style={SOFT_SHADOW}
          className="min-h-[50px] flex-row items-center rounded-2xl bg-surface px-4"
        >
          <Ionicons name="search" size={18} color="#0D16A8" />
          <TextInput
            value={placeQuery}
            onChangeText={(t) => void handlePlaceSearch(t)}
            placeholder="Search any town, bazaar, or city"
            placeholderTextColor="#94A3B8"
            className="ml-2.5 flex-1 py-3 text-sm text-ink"
          />
        </View>

        {placeFallback ? (
          <Text className="mt-1.5 text-xs text-muted">
            Place search unavailable; pick a locality below.
          </Text>
        ) : null}

        {suggestions.length > 0 ? (
          <View
            style={CARD_SHADOW}
            className="mt-2 gap-1 rounded-2xl bg-surface p-2"
          >
            {suggestions.map((s) => (
              <Pressable
                key={s.placeId}
                onPress={() => void handleSelectPlace(s)}
                className="min-h-[46px] flex-row items-center gap-2.5 rounded-xl px-3 py-2 active:bg-brand-tint"
              >
                <Ionicons name="location-outline" size={18} color="#0D16A8" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">
                    {s.mainText}
                  </Text>
                  {s.secondaryText ? (
                    <Text className="text-xs text-muted">
                      {s.secondaryText}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {errorMsg ? (
        <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-danger-bg p-3.5">
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text className="flex-1 text-sm text-danger">{errorMsg}</Text>
        </View>
      ) : null}

      {location?.outsideServiceArea ? (
        <View
          style={SOFT_SHADOW}
          className="mt-4 rounded-2xl border border-amber-bright bg-amber-tint p-4"
        >
          <Text className="text-sm font-bold text-ink">
            {STRINGS.location.outsideAreaTitle}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {STRINGS.location.outsideAreaPrefix}
            {serviceableDistrictLabel}.
          </Text>
        </View>
      ) : null}

      <Text className="mb-3 mt-6 text-sm font-bold text-ink">
        {STRINGS.location.manualHeading}
      </Text>

      {isLoadingLocalities ? (
        <Text className="text-sm text-muted">Loading locations...</Text>
      ) : (
        <View className="gap-3 pb-12">
          {districts.map((dist) => {
            const subAreas = childLocalities.filter(
              (l) => l.parentId === dist.id
            );
            return (
              <View
                key={dist.id}
                style={CARD_SHADOW}
                className="rounded-2xl bg-surface p-4"
              >
                <Pressable
                  onPress={() => {
                    void selectLocality(dist).then(() => router.back());
                  }}
                  className="min-h-[44px] flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="map-outline" size={18} color="#0D16A8" />
                    <Text className="text-base font-bold text-ink">
                      {dist.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </Pressable>

                <View className="mt-2.5 flex-row flex-wrap gap-2">
                  {subAreas.map((loc) => {
                    const active = location?.localityId === loc.id;
                    return (
                      <Pressable
                        key={loc.id}
                        onPress={() => {
                          void selectLocality(loc).then(() => router.back());
                        }}
                        className={`min-h-[36px] justify-center rounded-full px-3.5 ${
                          active
                            ? "bg-brand"
                            : "border border-hairline bg-canvas"
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            active ? "text-white" : "text-ink"
                          }`}
                        >
                          {loc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
    </KeyboardAwareView>
  );
}
