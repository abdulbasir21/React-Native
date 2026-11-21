import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { View } from "react-native";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface CategoryVisual {
  icon: MciName;
  color: string;
  bg: string;
}

const CATEGORY_MAP: Record<string, CategoryVisual> = {
  electrician: { icon: "flash", color: "#0D16A8", bg: "#EAEFFF" },
  bolt: { icon: "flash", color: "#0D16A8", bg: "#EAEFFF" },
  plumber: { icon: "pipe-wrench", color: "#0284C7", bg: "#E0F2FE" },
  plumbing: { icon: "pipe-wrench", color: "#0284C7", bg: "#E0F2FE" },
  "ac-technician": { icon: "air-conditioner", color: "#0891B2", bg: "#CFFAFE" },
  ac_unit: { icon: "air-conditioner", color: "#0891B2", bg: "#CFFAFE" },
  "solar-technician": {
    icon: "solar-panel-large",
    color: "#D97706",
    bg: "#FEF3C7",
  },
  solar_power: {
    icon: "solar-panel-large",
    color: "#D97706",
    bg: "#FEF3C7",
  },
  mechanic: { icon: "car-wrench", color: "#4338CA", bg: "#E0E7FF" },
  build: { icon: "car-wrench", color: "#4338CA", bg: "#E0E7FF" },
  carpenter: { icon: "hammer-screwdriver", color: "#B45309", bg: "#FFEDD5" },
  carpenter_icon: { icon: "hammer-screwdriver", color: "#B45309", bg: "#FFEDD5" },
  painter: { icon: "format-paint", color: "#7C3AED", bg: "#F3E8FF" },
  format_paint: { icon: "format-paint", color: "#7C3AED", bg: "#F3E8FF" },
  "mobile-repair": { icon: "cellphone-cog", color: "#15803D", bg: "#DCFCE7" },
  smartphone: { icon: "cellphone-cog", color: "#15803D", bg: "#DCFCE7" },
};

const DEFAULT_VISUAL: CategoryVisual = {
  icon: "tools",
  color: "#0D16A8",
  bg: "#EAEFFF",
};

interface CategoryIconProps {
  slug?: string;
  iconKey?: string;
  size?: "sm" | "md" | "lg";
}

export function CategoryIcon({
  slug,
  iconKey,
  size = "md",
}: CategoryIconProps) {
  const key = (slug && CATEGORY_MAP[slug] ? slug : iconKey) ?? "";
  const visual = CATEGORY_MAP[key] ?? DEFAULT_VISUAL;

  const boxSize =
    size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-14 w-14 rounded-2xl" : "h-12 w-12 rounded-2xl";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 28 : 24;

  return (
    <View
      className={`${boxSize} items-center justify-center`}
      style={{ backgroundColor: visual.bg }}
    >
      <MaterialCommunityIcons
        name={visual.icon}
        size={iconSize}
        color={visual.color}
      />
    </View>
  );
}
