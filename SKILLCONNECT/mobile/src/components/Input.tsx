import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="w-full">
      <Text className="mb-1.5 text-sm font-semibold text-ink">{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#9CA3AF"
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        className={`min-h-[48px] w-full rounded-xl bg-surface px-3.5 text-sm text-ink ${
          error
            ? "border border-danger"
            : focused
              ? "border-[1.5px] border-brand"
              : "border border-hairline"
        }`}
      />
      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
