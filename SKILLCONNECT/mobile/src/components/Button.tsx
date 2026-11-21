import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { SOFT_SHADOW } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "green" | "amber";
  icon?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const containerClass =
    variant === "secondary"
      ? "border border-brand bg-surface active:bg-brand-tint"
      : variant === "green"
        ? "bg-location-green active:bg-location-dark"
        : variant === "amber"
          ? "bg-amber-bright active:bg-amber-trust"
          : "bg-brand active:bg-brand-dark";

  const textColorClass =
    variant === "secondary" ? "text-brand" : "text-white";
  const iconColor = variant === "secondary" ? "#0D16A8" : "#FFFFFF";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={variant === "secondary" ? undefined : SOFT_SHADOW}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl px-5 ${containerClass} ${
        isDisabled ? "opacity-60" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
          <Text className={`text-sm font-bold ${textColorClass}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
