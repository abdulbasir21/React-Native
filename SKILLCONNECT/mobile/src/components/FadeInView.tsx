import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

interface FadeInViewProps {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}

/**
 * Restrained entrance animation that respects system reduced-motion preferences.
 */
export function FadeInView({
  children,
  delayMs = 0,
  className,
}: FadeInViewProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <View className={className}>{children}</View>;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(220).delay(delayMs)}
      className={className}
    >
      {children}
    </Animated.View>
  );
}
