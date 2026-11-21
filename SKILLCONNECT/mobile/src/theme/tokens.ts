import type { ViewStyle } from "react-native";

export const COLORS = {
  brand: "#0D16A8",
  brandDark: "#080E7D",
  brandDeep: "#05095A",
  brandBright: "#2432D9",
  brandTint: "#EAEFFF",
  brandTintBorder: "#CFD8FF",
  skyAccent: "#44B3E8",
  skyTint: "#E0F4FD",
  locationGreen: "#38B420",
  locationGreenDark: "#2A8F17",
  locationGreenTint: "#E9F9E5",
  amberTrust: "#F59E0B",
  amberBright: "#FBB03B",
  amberTint: "#FEF3C7",
  canvas: "#F2F6FC",
  surface: "#FFFFFF",
  ink: "#111827",
  muted: "#64748B",
  placeholder: "#94A3B8",
  hairline: "#E2E8F0",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
} as const;

export const CARD_SHADOW: ViewStyle = {
  shadowColor: "#0D16A8",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 4,
};

export const SOFT_SHADOW: ViewStyle = {
  shadowColor: "#0D16A8",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export const FAB_SHADOW: ViewStyle = {
  shadowColor: "#0D16A8",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 14,
  elevation: 8,
};
