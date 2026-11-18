import type { ProviderSearchResultDto } from "@skillconnect/shared";
import { Image, Pressable, Text, View } from "react-native";
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
        className="min-h-[88px] rounded-xl border border-hairline bg-surface p-4 active:bg-canvas"
      >
      <View className="flex-row gap-3">
        {provider.photoUrl ? (
          <Image
            source={{ uri: provider.photoUrl }}
            className="h-16 w-16 rounded-xl bg-canvas"
          />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-xl bg-brand-tint">
            <Text className="text-lg font-bold text-brand">
              {provider.displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}

        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              numberOfLines={1}
              className="flex-1 text-base font-semibold text-ink"
            >
              {provider.displayName}
            </Text>
            <View className="rounded-full bg-brand-tint px-2.5 py-0.5">
              <Text className="text-[11px] font-semibold text-brand">
                Verified
              </Text>
            </View>
          </View>

          <Text numberOfLines={1} className="mt-0.5 text-xs font-medium text-muted">
            {primaryCategory}
            {provider.matchingServiceTitle
              ? ` · ${provider.matchingServiceTitle}`
              : ""}
          </Text>

          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-muted">
              {provider.localityName} · {provider.distanceLabel}
            </Text>
            <View className="flex-row items-center gap-2">
              {provider.isAvailableNow ? (
                <View className="rounded-full bg-brand-tint px-2 py-0.5">
                  <Text className="text-[11px] font-semibold text-brand">
                    Available
                  </Text>
                </View>
              ) : null}
              <Text className="text-xs font-semibold text-amber-trust">
                {provider.averageRating !== null
                  ? `★ ${provider.averageRating.toFixed(1)} (${provider.reviewCount})`
                  : "New"}
              </Text>
            </View>
          </View>
        </View>
      </View>
      </Pressable>
    </FadeInView>
  );
}
