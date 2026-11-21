import { Tabs } from "expo-router";
import { RoyalTabBar } from "../../src/components/RoyalTabBar";
import { STRINGS } from "../../src/strings/en";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <RoyalTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: STRINGS.tabs.home }} />
      <Tabs.Screen name="chats" options={{ title: STRINGS.tabs.chats }} />
      <Tabs.Screen name="search" options={{ title: STRINGS.tabs.search }} />
      <Tabs.Screen name="bookings" options={{ title: STRINGS.tabs.bookings }} />
      <Tabs.Screen name="account" options={{ title: STRINGS.tabs.account }} />
    </Tabs>
  );
}
