import { Tabs } from "expo-router";
import { STRINGS } from "../../src/strings/en";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0D5C5A",
        tabBarInactiveTintColor: "#4B5563",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E5E7EB",
        },
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitleStyle: { color: "#111827", fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: STRINGS.tabs.home }} />
      <Tabs.Screen name="search" options={{ title: STRINGS.tabs.search }} />
      <Tabs.Screen name="chats" options={{ title: STRINGS.tabs.chats }} />
      <Tabs.Screen name="bookings" options={{ title: STRINGS.tabs.bookings }} />
      <Tabs.Screen name="account" options={{ title: STRINGS.tabs.account }} />
    </Tabs>
  );
}
