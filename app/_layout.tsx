import { useEffect, useCallback, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import NetInfo from "@react-native-community/netinfo";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium,
  DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold,
} from "@expo-google-fonts/dm-sans";
import { useAuthStore } from "../src/store/auth";
import { useOfflineStore } from "../src/store/offline";
import { Typography } from "../src/theme";
import { useThemeStore } from "../src/store/theme";
import { useBrandingStore } from "../src/store/branding";
import { ToastHost } from "../src/components/Toast";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { usePushNotifications } from "../src/hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, gcTime: 5 * 60_000 } },
});

function AutoSync() {
  const { syncAll, syncDeliveryActions, orders, deliveryActions } = useOfflineStore();
  const qc = useQueryClient();
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? false;

      if (online && wasOffline.current) {
        const pendingOrders = orders.filter((o) => !o.synced);
        const pendingActions = deliveryActions.filter((a) => !a.synced);

        if (pendingOrders.length > 0) {
          syncAll().then(({ synced }) => {
            if (synced > 0) qc.invalidateQueries({ queryKey: ["myOrders"] });
          });
        }
        if (pendingActions.length > 0) {
          syncDeliveryActions().then(({ synced }) => {
            if (synced > 0) qc.invalidateQueries({ queryKey: ["myDeliveries"] });
          });
        }
      }

      wasOffline.current = !online;
    });

    return unsub;
  }, [orders, deliveryActions, syncAll, syncDeliveryActions, qc]);

  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hydrate } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Register push token on auth
  usePushNotifications();

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { load } = useOfflineStore();
  const { loadTheme, isDark, colors } = useThemeStore();
  const { load: loadBranding } = useBrandingStore();

  const [fontsLoaded] = useFonts({
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold,
  });

  useEffect(() => {
    load(); loadTheme(); loadBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => { onLayout(); }, [onLayout]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <QueryClientProvider client={queryClient}>
          <AuthGate>
            <AutoSync />
            <StatusBar style={isDark ? "light" : "dark"} />
            <ToastHost />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg.secondary },
                headerTintColor: colors.text.primary,
                headerTitleStyle: { fontFamily: "DMSans_700Bold", fontSize: Typography.size.lg, color: colors.text.primary },
                contentStyle: { backgroundColor: colors.bg.primary },
                headerShadowVisible: false,
                headerBackTitle: "Назад",
                animation: "slide_from_right",
                animationDuration: 300,
              }}
            >
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="order/new" options={{ title: "Новый заказ", presentation: "modal" }} />
              <Stack.Screen name="shop/new" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="shop/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="shop/nearby" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="merchandiser/visit" options={{ headerShown: false, presentation: "modal" }} />
            </Stack>
          </AuthGate>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
