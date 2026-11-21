import { Ionicons } from "@expo/vector-icons";
import type { ProviderSearchResultDto } from "@skillconnect/shared";
import { Image, Pressable, Text, View } from "react-native";
import { CARD_SHADOW } from "../theme/tokens";
import { FadeInView } from "./FadeInView";

interface ProviderCardProps {
  provider: ProviderSearchResultDto;
  onPress: () => void;
}

export function ProviderCard({ provider, onPress }: ProviderCardProps) {
  const primaryCategory = provider.categories[0]?.name ?? "Technician";

  return (
    <FadeInView>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${provider.displayName}, ${primaryCategory}, ${provider.distanceLabel}`}
        style={CARD_SHADOW}
        className="min-h-[82px] flex-row items-center gap-3.5 rounded-2xl bg-surface p-3.5 active:bg-canvas"
      >
        {/* Left circular avatar with live availability dot */}
        <View className="relative">
          {provider.photoUrl ? (
            <Image
              source={{ uri: provider.photoUrl }}
              className="h-14 w-14 rounded-full bg-brand-tint"
            />
          ) : (
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
              <Text className="text-lg font-bold text-brand">
                {provider.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          {provider.isAvailableNow ? (
            <View className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-location-green" />
          ) : null}
        </View>

        {/* Middle text block inspired by reference list cards */}
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className="flex-shrink text-base font-bold text-ink"
            >
              {provider.displayName}
            </Text>
            <Ionicons name="shield-checkmark" size={14} color="#0D16A8" />
          </View>

          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs font-bold text-location-dark"
          >
            {primaryCategory} · {provider.distanceLabel}
          </Text>

          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons name="location-outline" size={12} color="#64748B" />
            <Text numberOfLines={1} className="flex-1 text-xs text-muted">
              {provider.localityName}
              {provider.matchingServiceTitle
                ? ` · ${provider.matchingServiceTitle}`
                : ""}
            </Text>
          </View>
        </View>

        {/* Right golden medal / rating badge */}
        <View className="items-center">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-tint">
            <Ionicons name="ribbon" size={20} color="#F59E0B" />
          </View>
          <Text className="mt-1 text-[11px] font-bold text-amber-trust">
            {provider.averageRating !== null
              ? `${provider.averageRating.toFixed(1)} ★`
              : "New"}
          </Text>
        </View>
      </Pressable>
    </FadeInView>
  );
}
