import type {
  PlaceDetailsDto,
  PlaceSuggestionDto,
} from "@skillconnect/shared";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiRequest } from "../src/api/client";
import { Button } from "../src/components/Button";
import { useLocationSelection } from "../src/features/location/LocationContext";
import { STRINGS } from "../src/strings/en";

export default function LocationPickerScreen() {
  const router = useRouter();
  const {
    location,
    localities,
    isLoadingLocalities,
    serviceableDistrictLabel,
    selectCoordinates,
    selectLocality,
  } = useLocationSelection();

  const [gpsLoading, setGpsLoading] = useState(false);
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
          res.place.name
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
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg(STRINGS.location.permissionDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await selectCoordinates(
        pos.coords.latitude,
        pos.coords.longitude,
        "Current GPS Location"
      );
      router.back();
    } catch {
      setErrorMsg(STRINGS.location.permissionDenied);
    } finally {
      setGpsLoading(false);
    }
  };

  const districts = localities.filter((l) => l.level === "DISTRICT");
  const childLocalities = localities.filter((l) => l.level === "LOCALITY");

  return (
    <ScrollView className="flex-1 bg-canvas px-4 py-6">
      <Text className="text-2xl font-semibold text-ink">
        {STRINGS.location.title}
      </Text>
      <Text className="mt-1 text-sm text-muted">{STRINGS.location.subtitle}</Text>

      <View className="mt-4">
        <Button
          title={gpsLoading ? STRINGS.location.checkingGps : STRINGS.location.useGpsButton}
          loading={gpsLoading}
          onPress={() => void handleUseGps()}
        />
      </View>

      <View className="mt-4">
        <TextInput
          value={placeQuery}
          onChangeText={(t) => void handlePlaceSearch(t)}
          placeholder="Search place or bazaar (optional)"
          placeholderTextColor="#9CA3AF"
          className="min-h-[48px] rounded-xl border border-hairline bg-surface px-4 text-sm text-ink"
        />
        {placeFallback ? (
          <Text className="mt-1 text-xs text-muted">
            Place search unavailable; pick a locality below.
          </Text>
        ) : null}
        {suggestions.length > 0 ? (
          <View className="mt-2 gap-1.5 rounded-xl border border-hairline bg-surface p-2">
            {suggestions.map((s) => (
              <Pressable
                key={s.placeId}
                onPress={() => void handleSelectPlace(s)}
                className="min-h-[44px] justify-center rounded-lg px-3 py-2 active:bg-canvas"
              >
                <Text className="text-sm font-medium text-ink">
                  {s.mainText}
                </Text>
                {s.secondaryText ? (
                  <Text className="text-xs text-muted">{s.secondaryText}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {errorMsg ? (
        <View className="mt-3 rounded-xl bg-danger-bg p-3">
          <Text className="text-sm text-danger">{errorMsg}</Text>
        </View>
      ) : null}

      {location?.outsideServiceArea ? (
        <View className="mt-4 rounded-xl border border-amber-trust bg-surface p-4">
          <Text className="text-sm font-semibold text-amber-trust">
            {STRINGS.location.outsideAreaTitle}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {STRINGS.location.outsideAreaPrefix}
            {serviceableDistrictLabel}.
          </Text>
        </View>
      ) : null}

      <Text className="mb-3 mt-6 text-sm font-semibold text-ink">
        {STRINGS.location.manualHeading}
      </Text>

      {isLoadingLocalities ? (
        <Text className="text-sm text-muted">Loading locations...</Text>
      ) : (
        <View className="gap-3 pb-10">
          {districts.map((dist) => {
            const subAreas = childLocalities.filter((l) => l.parentId === dist.id);
            return (
              <View
                key={dist.id}
                className="rounded-xl border border-hairline bg-surface p-4"
              >
                <Pressable
                  onPress={() => {
                    void selectLocality(dist).then(() => router.back());
                  }}
                  className="min-h-[44px] justify-center"
                >
                  <Text className="text-base font-semibold text-ink">
                    {dist.name}
                  </Text>
                </Pressable>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {subAreas.map((loc) => {
                    const active = location?.localityId === loc.id;
                    return (
                      <Pressable
                        key={loc.id}
                        onPress={() => {
                          void selectLocality(loc).then(() => router.back());
                        }}
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
  );
}
