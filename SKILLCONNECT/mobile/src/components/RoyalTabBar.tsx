import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FAB_SHADOW } from "../theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type RoyalTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TAB_ICONS: Record<
  string,
  { active: IoniconName; inactive: IoniconName; label: string }
> = {
  index: { active: "home", inactive: "home-outline", label: "Home" },
  chats: {
    active: "chatbubbles",
    inactive: "chatbubbles-outline",
    label: "Chats",
  },
  search: { active: "search", inactive: "search", label: "Search" },
  bookings: {
    active: "calendar",
    inactive: "calendar-outline",
    label: "Bookings",
  },
  account: { active: "person", inactive: "person-outline", label: "Account" },
};

export function RoyalTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets: tabInsets,
}: RoyalTabBarProps) {
  const safeInsets = useSafeAreaInsets();
  const bottomPad = Math.max(tabInsets?.bottom ?? safeInsets.bottom, 10);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0"
    >
      <View
        className="flex-row items-center justify-around bg-brand px-2 pt-2.5"
        style={{
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: bottomPad,
          shadowColor: "#05095A",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
          elevation: 14,
        }}
      >
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const isFocused = state.index === index;
          const meta = TAB_ICONS[route.name] ?? {
            active: "ellipse",
            inactive: "ellipse-outline",
            label: descriptor?.options?.title ?? route.name,
          };

          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          if (route.name === "search") {
            return (
              <View key={route.key} className="-mt-9 items-center">
                <Pressable
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={meta.label}
                  accessibilityState={{ selected: isFocused }}
                  style={FAB_SHADOW}
                  className="h-[62px] w-[62px] items-center justify-center rounded-full border-4 border-canvas bg-sky-accent active:opacity-90"
                >
                  <Ionicons name="search" size={26} color="#FFFFFF" />
                </Pressable>
                <Text
                  className={`mt-1 text-[10px] font-semibold ${
                    isFocused ? "text-white" : "text-white/75"
                  }`}
                >
                  {meta.label}
                </Text>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: isFocused }}
              className="min-h-[44px] min-w-[56px] items-center justify-center rounded-xl py-1 active:opacity-80"
            >
              <Ionicons
                name={isFocused ? meta.active : meta.inactive}
                size={21}
                color={isFocused ? "#FFFFFF" : "rgba(255,255,255,0.68)"}
              />
              <Text
                className={`mt-1 text-[10px] font-semibold ${
                  isFocused ? "text-white" : "text-white/70"
                }`}
              >
                {meta.label}
              </Text>
              {isFocused ? (
                <View className="mt-1 h-1 w-4 rounded-full bg-sky-accent" />
              ) : (
                <View className="mt-1 h-1 w-4" />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
