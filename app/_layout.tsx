import { useEffect, useCallback, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, useQueryClient, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";
/*
  Manrope вместо DM Sans, JetBrains Mono вместо DM Mono.

  У DM Sans и DM Mono в наборе только латиница. Приложение русское, поэтому
  каждое слово подменялось системным шрифтом — молча, без единой ошибки, и
  оттого незаметно. У обоих новых кириллица родная.
*/
import {
  useFonts, Manrope_400Regular, Manrope_500Medium,
  Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useAuthStore } from "../src/store/auth";
import { useOfflineStore } from "../src/store/offline";
import { useVisitQueue } from "../src/store/visit-queue";
import { Typography } from "../src/theme";
import { useThemeStore } from "../src/store/theme";
import { useBrandingStore } from "../src/store/branding";
import { ToastHost } from "../src/components/Toast";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { LockScreen } from "../src/components/LockScreen";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { useAutoLock } from "../src/hooks/useAutoLock";
import { useVisitReminders } from "../src/hooks/useVisitReminders";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, gcTime: 5 * 60_000 } },
});

/*
  Возвращение приложения из фона — это и есть «фокус окна».

  У react-query свойство refetchOnWindowFocus включено по умолчанию, но в
  телефоне окна нет: без этой подписки оно не срабатывает никогда. Отсюда и
  бралось «открыл приложение утром — вижу вчерашние заказы»: данные
  обновлялись только при полной выгрузке из памяти.

  Подписка ставится один раз на весь запуск, вне дерева: перевешивать её на
  каждой отрисовке незачем.
*/
AppState.addEventListener("change", (status: AppStateStatus) => {
  focusManager.setFocused(status === "active");
});

function AutoSync() {
  const { syncAll, syncDeliveryActions } = useOfflineStore();
  const qc = useQueryClient();
  const wasOffline = useRef(false);
  const syncing = useRef(false);

  // Helper to run sync if there are pending items
  const runSync = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    const { orders, deliveryActions } = useOfflineStore.getState();
    const pendingOrders = orders.filter((o) => !o.synced);
    const pendingActions = deliveryActions.filter((a) => !a.synced);
    const pendingVisits = useVisitQueue.getState().actions.filter((a) => !a.synced);

    const tasks: Promise<unknown>[] = [];
    // Третья очередь — визиты и фото: см. store/visit-queue.
    if (pendingVisits.length > 0) {
      tasks.push(useVisitQueue.getState().sync().then(({ synced }) => {
        if (synced > 0) qc.invalidateQueries({ queryKey: ["agentPlans"] });
      }));
    }
    if (pendingOrders.length > 0) {
      tasks.push(syncAll().then(({ synced }) => {
        if (synced > 0) qc.invalidateQueries({ queryKey: ["myOrders"] });
      }));
    }
    if (pendingActions.length > 0) {
      tasks.push(syncDeliveryActions().then(({ synced }) => {
        if (synced > 0) qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      }));
    }

    if (tasks.length === 0) { syncing.current = false; return; }
    Promise.all(tasks).finally(() => { syncing.current = false; });
  }, [syncAll, syncDeliveryActions, qc]);

  // Sync once the queue has actually been read off disk — catches pending
  // items from a previous session.
  //
  // This used to run on mount, which was always too early: React runs a
  // child's effects before its parent's, and load() is kicked off in
  // RootLayout's effect, so this fired while `orders` was still the empty
  // initial state and synced nothing. Anything queued offline then sat there
  // until the agent happened to open the Orders tab or the connection
  // flapped — long enough for them to assume the order hadn't gone through
  // and enter it a second time.
  const loaded = useOfflineStore((s) => s.loaded);
  useEffect(() => {
    if (loaded) runSync();
  }, [loaded, runSync]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? false;

      if (online && wasOffline.current) {
        runSync();
      }

      wasOffline.current = !online;
    });

    return unsub;
  }, [runSync]);

  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hydrate } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Register push token on auth
  usePushNotifications();
  useAutoLock();
  useVisitReminders();

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Бренд арендатора известен только по токену: до входа сервер не знает, чей
  // это телефон. Поэтому запрос идёт здесь, а не при запуске приложения, —
  // и одинаково после ввода пароля, после входа по отпечатку и после
  // восстановления сессии.
  useEffect(() => {
    if (isAuthenticated) useBrandingStore.getState().refresh();
  }, [isAuthenticated]);

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
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    load(); loadTheme(); loadBranding();
    void useVisitQueue.getState().load();
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
            <OfflineBanner />
            <StatusBar style={isDark ? "light" : "dark"} />
            <ToastHost />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg.secondary },
                headerTintColor: colors.text.primary,
                headerTitleStyle: { fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary },
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
              <Stack.Screen name="order/deliver" options={{ headerShown: false }} />
              <Stack.Screen name="merchandiser/visit" options={{ headerShown: false, presentation: "modal" }} />
              {/*
                Своя шапка, поэтому системная выключена: иначе на экране
                оказались бы два заголовка друг над другом — незаявленный
                экран получает её по умолчанию.
              */}
              <Stack.Screen name="salary" options={{ headerShown: false }} />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="debts" options={{ headerShown: false }} />
            </Stack>
            {/* Поверх всего: экран блокировки по простою. Ниже Stack, чтобы
                закрывать любой открытый экран, включая модальные. */}
            <LockScreen />
          </AuthGate>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
