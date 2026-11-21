import type { ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface KeyboardAwareViewProps {
  children: ReactNode;
  hasHeader?: boolean;
  extraOffset?: number;
  className?: string;
}

export function KeyboardAwareView({
  children,
  hasHeader = false,
  extraOffset = 0,
  className = "flex-1 bg-canvas",
}: KeyboardAwareViewProps) {
  const insets = useSafeAreaInsets();
  const keyboardVerticalOffset = (hasHeader ? insets.top + 56 : 0) + extraOffset;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
      className={className}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
