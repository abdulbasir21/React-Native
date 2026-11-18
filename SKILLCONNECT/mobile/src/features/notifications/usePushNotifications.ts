import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { apiRequest } from "../../api/client";
import { useAuth } from "../auth/AuthProvider";

/**
 * Registers the device Expo push token when signed in.
 * Silently no-ops if permissions are denied or running in an unsupported environment.
 */
export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;

    let cancelled = false;

    void (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        let finalStatus = current.status;
        if (finalStatus !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          finalStatus = requested.status;
        }
        if (finalStatus !== "granted" || cancelled) return;

        const tokenRes = await Notifications.getExpoPushTokenAsync();
        if (!tokenRes.data || cancelled) return;

        await apiRequest("/api/v1/notifications/push-token", {
          method: "POST",
          body: JSON.stringify({
            expoPushToken: tokenRes.data,
            platform: Platform.OS === "ios" ? "ios" : "android",
          }),
        });
      } catch {
        // Push registration is best-effort and must never crash the app
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
