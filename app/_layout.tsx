import { useEffect, useCallback, useRef } from "react";
import { useLangStore, useT } from "../src/i18n";
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
/*
  Фоновая задача GPS объявляется здесь, в точке входа, а не там, где её
  включают. Когда система будит убитое приложение ради накопленных точек, она
  поднимает JS-бандл и ищет задачу по имени; вкладка «GPS» при этом не
  открывается, и объявленная только в ней задача «не найдена» — точки за всё
  время до следующего запуска вкладки выбрасывались.
*/
import { flushPendingLocations } from "../src/backgroundLocation";
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
  // Связь вернулась, пока проход ещё висел на таймаутах, — событие не
  // теряется: проход повторится сразу по завершении.
  const rerun = useRef(false);
  // Себя же по ссылке: функция не может сослаться на своё имя до объявления.
  const runSyncRef = useRef<() => void>(() => {});

  // Helper to run sync if there are pending items
  const runSync = useCallback(() => {
    if (syncing.current) { rerun.current = true; return; }
    // Пока не известно, кто вошёл, не отправляем ничего: записи с владельцем
    // ушли бы под первым попавшимся токеном (см. shouldAutoSync).
    if (!useAuthStore.getState().user) return;
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
    // Точки, снятые без связи (визиты, ручные), — тем же проходом: у агента
    // без фонового сбора их иначе некому вылить.
    tasks.push(flushPendingLocations());

    Promise.all(tasks).finally(() => {
      syncing.current = false;
      if (rerun.current) { rerun.current = false; runSyncRef.current(); }
    });
  }, [syncAll, syncDeliveryActions, qc]);
  useEffect(() => { runSyncRef.current = runSync; }, [runSync]);

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
  // И после входа: на холодном старте очередь прочитана раньше, чем сессия, и
  // первый вызов уходит впустую — второй, по входу, отправляет накопленное.
  const authed = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (loaded && authed) runSync();
  }, [loaded, authed, runSync]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? false;

      if (online && wasOffline.current) {
        runSync();
      }

      wasOffline.current = !online;
    });
    // Возврат из фона — третий повод: у курьера и мерчандайзера нет вкладки
    // «Заказы», и без флапа сети их очередь ждала часами.
    const app = AppState.addEventListener("change", (s: AppStateStatus) => { if (s === "active") runSync(); });

    return () => { unsub(); app.remove(); };
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
  const t = useT();

  const [fontsLoaded] = useFonts({
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    load(); loadTheme(); loadBranding(); void useLangStore.getState().loadLang();
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
                headerBackTitle: t("Назад", "Orqaga"),
                animation: "slide_from_right",
                animationDuration: 300,
              }}
            >
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* Новый заказ — страница, не модалка (владелец: «другая страница, где
                  агент добавляет товары»), и без системной шапки: у экрана своя —
                  «← Новый заказ», магазин, шаги. С обеими «Новый заказ» стоял
                  дважды подряд (кадр лендинга 25.09.2026). title остаётся для
                  истории навигации и чтения экрана. */}
              <Stack.Screen name="order/new" options={{ title: t("Новый заказ", "Yangi buyurtma"), headerShown: false }} />
              <Stack.Screen name="shop/new" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="shop/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
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
