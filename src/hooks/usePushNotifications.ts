// Warehouse Pro — Push notifications registration and handling
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken, removePushToken } from "../api";
import { useAuthStore } from "../store/auth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Push] Push notification permission not granted");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

export function usePushNotifications() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function register() {
      try {
        const token = await getExpoPushToken();
        if (cancelled || !token) return;

        tokenRef.current = token;
        await registerPushToken(token);

        // Android needs a notification channel
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Warehouse Pro",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#3b6fe0",
          });
        }
      } catch (e) {
        console.warn("[Push] Failed to register:", e);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Cleanup on logout
  useEffect(() => {
    if (isAuthenticated || !tokenRef.current) return;

    async function unregister() {
      try {
        await removePushToken();
        tokenRef.current = null;
      } catch (e) {
        console.warn("[Push] Failed to unregister:", e);
      }
    }

    unregister();
  }, [isAuthenticated]);
}
