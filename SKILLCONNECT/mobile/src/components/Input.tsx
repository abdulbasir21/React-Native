import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { SOFT_SHADOW } from "../theme/tokens";

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
}

export function Input({ label, error, icon, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="w-full">
      <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <View
        style={SOFT_SHADOW}
        className={`min-h-[48px] w-full flex-row items-center rounded-2xl bg-surface px-3.5 ${
          error
            ? "border-[1.5px] border-danger"
            : focused
              ? "border-[1.5px] border-brand"
              : "border border-hairline"
        }`}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? "#0D16A8" : "#94A3B8"}
            style={{ marginRight: 8 }}
          />
        ) : null}
        <TextInput
          {...props}
          placeholderTextColor="#94A3B8"
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className="flex-1 py-2.5 text-sm text-ink"
        />
      </View>
      {error ? (
        <Text className="mt-1 text-xs font-medium text-danger">{error}</Text>
      ) : null}
    </View>
  );
}
