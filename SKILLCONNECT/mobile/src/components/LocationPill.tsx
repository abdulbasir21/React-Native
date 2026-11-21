import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocationSelection } from "../features/location/LocationContext";
import { SOFT_SHADOW } from "../theme/tokens";

export function LocationPill() {
  const router = useRouter();
  const { location, isDetectingGps, locationSource } = useLocationSelection();

  const subtitleText =
    locationSource === "gps"
      ? "Phone Current Location"
      : locationSource === "manual"
        ? "Selected Area"
        : "Current Area";

  const displayLabel = isDetectingGps
    ? "Detecting phone location..."
    : (location?.label ?? "Tap Change to pick location");

  return (
    <Pressable
      onPress={() => router.push("/location")}
      accessibilityRole="button"
      accessibilityLabel={`Current location ${displayLabel}. Tap to change location`}
      style={SOFT_SHADOW}
      className="min-h-[54px] flex-row items-center justify-between rounded-2xl bg-location-green px-3.5 py-2.5 active:bg-location-dark"
    >
      <View className="flex-1 flex-row items-center gap-2.5 pr-2">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-white/20">
          {isDetectingGps ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="locate" size={18} color="#FFFFFF" />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-white/85">
            {subtitleText}
          </Text>
          <Text numberOfLines={1} className="text-sm font-bold text-white">
            {displayLabel}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => router.push("/location")}
        accessibilityRole="button"
        accessibilityLabel="Change location"
        className="min-h-[34px] flex-row items-center gap-1 rounded-xl bg-white px-3 py-1.5 active:bg-canvas"
      >
        <Ionicons name="swap-horizontal" size={14} color="#2A8F17" />
        <Text className="text-xs font-bold text-location-dark">Change</Text>
      </Pressable>
    </Pressable>
  );
}
