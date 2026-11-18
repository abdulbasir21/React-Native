import { ActivityIndicator, Pressable, Text } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`min-h-[48px] flex-row items-center justify-center rounded-xl px-5 ${
        isPrimary
          ? "bg-brand active:bg-brand-dark"
          : "border border-brand bg-transparent active:bg-brand-tint"
      } ${isDisabled ? "opacity-60" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#FFFFFF" : "#0D5C5A"} />
      ) : (
        <Text
          className={`text-sm font-semibold ${
            isPrimary ? "text-white" : "text-brand"
          }`}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
