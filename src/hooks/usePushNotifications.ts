// Warehouse Pro — Push notifications registration and handling
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
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
    if (__DEV__) console.warn("[Push] Push notification permission not granted");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data;

  // Deep link based on notification type
  if (data?.type === "order.delivered" || data?.type === "order.failed") {
    if (data.orderId) {
      router.push(`/order/${data.orderId}`);
    } else {
      router.push("/(tabs)/deliveries");
    }
  } else if (data?.type === "order.assigned") {
    router.push("/(tabs)/deliveries");
  } else if (data?.type === "order.created") {
    router.push("/(tabs)/orders");
  }
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
        if (__DEV__) console.warn("[Push] Failed to register:", e);
      }
    }

    register();

    // Listen for notification taps (foreground + background)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Handle notification that opened the app from killed state
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      cancelled = true;
      responseSubscription.remove();
    };
  }, [isAuthenticated]);

  // Cleanup on logout.
  //
  // This runs after the store has already flipped to signed-out, which means
  // apiLogout() has usually invalidated the session and this call is rejected.
  // It's a best-effort belt: the authoritative cleanup is server-side, where
  // registerPushToken takes the token away from whoever held it last, so a
  // handed-over phone can't keep notifying the previous agent even when this
  // request never lands.
  useEffect(() => {
    if (isAuthenticated || !tokenRef.current) return;

    async function unregister() {
      try {
        await removePushToken();
      } catch (e) {
        if (__DEV__) console.warn("[Push] Failed to unregister:", e);
      } finally {
        tokenRef.current = null;
      }
    }

    unregister();
  }, [isAuthenticated]);
}
