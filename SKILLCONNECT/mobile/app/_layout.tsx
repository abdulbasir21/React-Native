import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { AuthProvider } from "../src/features/auth/AuthProvider";
import { LocationProvider } from "../src/features/location/LocationContext";
import { usePushNotifications } from "../src/features/notifications/usePushNotifications";

function PushRegistrar() {
  usePushNotifications();
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushRegistrar />
        <LocationProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              headerStyle: { backgroundColor: "#0D16A8" },
              headerTintColor: "#FFFFFF",
              headerTitleStyle: { fontWeight: "700", fontSize: 17 },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)/login" />
            <Stack.Screen name="(auth)/register" />
            <Stack.Screen
              name="location"
              options={{ headerShown: true, title: "Select Location" }}
            />
            <Stack.Screen
              name="become-provider/index"
              options={{ headerShown: true, title: "Provider Area" }}
            />
            <Stack.Screen
              name="provider/[id]"
              options={{ headerShown: true, title: "Technician Profile" }}
            />
            <Stack.Screen
              name="chat/[conversationId]"
              options={{ headerShown: true, title: "Conversation" }}
            />
            <Stack.Screen
              name="booking/[id]"
              options={{ headerShown: true, title: "Booking Detail" }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: true, title: "Notifications" }}
            />
          </Stack>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
