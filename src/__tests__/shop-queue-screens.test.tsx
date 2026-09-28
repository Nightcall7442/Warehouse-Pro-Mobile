/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Четвёртая очередь на экранах: новый магазин без связи, заказ на него,
 * карточка ждущего магазина. Проверки поведенческие — настоящие экраны;
 * сама очередь — shop-queue.test.ts.
 */

const mockRouteParams: Record<string, string> = {};
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) },
}));
jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  createOrder: jest.fn(),
  createShop: jest.fn(),
  uploadFile: jest.fn(),
  getProducts: jest.fn(),
  getAvailableShops: jest.fn(),
  getTerritories: jest.fn(async () => []),
  getMyOrders: jest.fn(async () => []),
}));
jest.mock("../backgroundLocation", () => ({
  flushPendingLocations: jest.fn(async () => {}),
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
jest.mock("expo-router", () => ({
  // Геттер: фабрика заглушки выполняется раньше, чем объявлен mockRouter.
  get router() { return mockRouter; },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockRouteParams,
  useFocusEffect: jest.fn(),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
// Экран нового магазина готовит снимок нативным модулем; в jest его нет.
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn(async (uri: string) => ({ dataUrl: `data:${uri}` })) }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));
jest.mock("../store/theme", () => {
  const colors = {
    bg: { primary: "#fff", secondary: "#f7f7f7", card: "#fff", elevated: "#f0f0f0", input: "#e0e0e0" },
    text: { primary: "#000", secondary: "#666", tertiary: "#888", muted: "#999" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0", primaryDim: "#e8edf8", primaryLight: "#5b8cf0", ink: "#fff" },
    accent: { primary: "#3b6fe0", success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
    status: {
      success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0",
      successDim: "#e8f8f0", warningDim: "#fdf0e0", dangerDim: "#fde8e8", infoDim: "#e8edf8",
    },
  };
  return { useThemeColors: () => colors, useThemeStore: () => ({ isDark: false }) };
});
// Корневая раскладка (AutoSync) тянет шрифты, заставку и слежение за сетью.
jest.mock("@react-native-community/netinfo", () => ({ __esModule: true, default: { addEventListener: jest.fn(() => () => {}) } }));
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(async () => {}), hideAsync: jest.fn(async () => {}) }));
jest.mock("@expo-google-fonts/manrope", () => ({ useFonts: () => [true] }));
jest.mock("@expo-google-fonts/jetbrains-mono", () => ({ JetBrainsMono_400Regular: 0 }));
jest.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: { children: unknown }) => children }));
// Оболочка раскладки вокруг AutoSync — здесь не проверяется, а тянет нативное.
jest.mock("../components/LockScreen", () => ({ LockScreen: () => null }));
jest.mock("../hooks/usePushNotifications", () => ({ usePushNotifications: () => {} }));
jest.mock("../hooks/useAutoLock", () => ({ useAutoLock: () => {} }));
jest.mock("../hooks/useVisitReminders", () => ({ useVisitReminders: () => {} }));
jest.mock("../store/recentShops", () => ({
  getRecentShopIds: jest.fn(async () => []),
  addRecentShop: jest.fn(async () => {}),
}));

import React from "react";
import { readFileSync } from "fs";
import { AutoSync, queryClient } from "../../app/_layout";
import { OfflineBanner } from "../components/OfflineBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewOrderScreen from "../../app/order/new";
import NewShopScreen from "../../app/shop/new";
import OrdersScreen from "../../app/(tabs)/orders";
import { Alert } from "react-native";
import { PendingShops } from "../components/PendingShops";
import { useShopQueue, type PendingShop } from "../store/shop-queue";
import { useOfflineStore } from "../store/offline";
import { useAuthStore } from "../store/auth";
import { useToastStore } from "../store/toast";

const apiMock = require("../api");
const KEY = "0b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d";
const LOCAL = -1_790_000_000_000;
const pending = (p: Partial<PendingShop> = {}): PendingShop => ({
  localId: LOCAL, input: { name: "Новая точка", city: "Хива", idempotencyKey: KEY },
  createdAt: new Date().toISOString(), ownerId: 10, synced: false, status_: "pending", ...p,
});

function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  useShopQueue.setState({ shops: [], loaded: true, syncing: false });
  useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false });
  useAuthStore.setState({ user: { id: 10, name: "Агент", role: "agent" } as never });
  useToastStore.setState({ toast: null });
});

describe("заказ на магазин, заведённый без связи", () => {
  it("магазин в выборе с пометкой; заказ не уходит на сервер с временным id, а ложится в очередь", async () => {
    useShopQueue.setState({ shops: [pending()] });
    apiMock.getAvailableShops.mockRejectedValue(new Error("Network Error"));
    apiMock.getProducts.mockResolvedValue([{ id: 7, name: "Сахар 1 кг", code: "S1", unitPrice: "12000.00", available: "100.000", unit: "kg" }]);
    // Заказ со сканера: строка уже есть, остаётся выбрать магазин.
    Object.assign(mockRouteParams, { productId: "7", productName: "Сахар 1 кг", productPrice: "12000.00" });

    mount(<NewOrderScreen />);
    expect(await screen.findByText("Новый · ждёт отправки")).toBeTruthy();
    fireEvent.click(screen.getByText("Новая точка"));
    // Каталог — общий: у временного id своих цен на сервере нет.
    await waitFor(() => expect(apiMock.getProducts).toHaveBeenCalled());
    expect(apiMock.getProducts.mock.calls.every((c: any[]) => c[1] === undefined)).toBe(true);

    fireEvent.click(await screen.findByText("Продолжить →"));
    fireEvent.click(await screen.findByText("Подтвердить заказ"));

    await waitFor(() => expect(useOfflineStore.getState().orders).toHaveLength(1));
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    const queued = useOfflineStore.getState().orders[0];
    expect(queued.input.shopId).toBe(LOCAL);
    expect(queued.input.items).toEqual([{ productId: 7, quantity: 1, unitPrice: 12000, discount: 0 }]);
    expect(useToastStore.getState().toast?.message).toMatch(/уйдёт сразу за новым магазином/);
  }, 15_000);
});

describe("новый магазин без связи", () => {
  it("«Создать» без сети — магазин в очереди с тем же ключом попытки, экран закрыт", async () => {
    apiMock.createShop.mockRejectedValue(new Error("Network Error"));
    mount(<NewShopScreen />);
    fireEvent.change(screen.getByPlaceholderText("Продукты 24"), { target: { value: "Лавка у моста" } });
    fireEvent.click(screen.getByText("Создать магазин"));

    await waitFor(() => expect(useShopQueue.getState().shops).toHaveLength(1));
    const [shop] = useShopQueue.getState().shops;
    expect(shop.input.name).toBe("Лавка у моста");
    expect(shop.localId).toBeLessThan(0);
    // Ключ тот же, что у сорвавшегося запроса: дошёл ли он, сервер узнает по ключу.
    expect(shop.input.idempotencyKey).toBe(apiMock.createShop.mock.calls[0][0].idempotencyKey);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(useToastStore.getState().toast?.message).toMatch(/магазин сохранён на телефоне/);
  });

  it("отказ сервера по существу — в очередь не кладётся, форма остаётся", async () => {
    apiMock.createShop.mockRejectedValue(Object.assign(new Error("Территория не найдена"), { trpcMessage: "Территория не найдена", serverRejected: true }));
    mount(<NewShopScreen />);
    fireEvent.change(screen.getByPlaceholderText("Продукты 24"), { target: { value: "Лавка у моста" } });
    fireEvent.click(screen.getByText("Создать магазин"));

    await waitFor(() => expect(useToastStore.getState().toast?.variant).toBe("error"));
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe("снимок нового магазина без связи", () => {
  const picker = require("expo-image-picker");
  const fs = require("expo-file-system/legacy");
  const CAM = "file:///cache/ImagePicker/shop.jpg";

  async function shootOffline() {
    // «Сделать фото» в окне выбора нажато сразу; камера отдала кадр, связи нет.
    jest.spyOn(Alert, "alert").mockImplementationOnce((_t, _m, buttons) => { buttons?.[0]?.onPress?.(); });
    picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: CAM }] });
    apiMock.uploadFile.mockRejectedValueOnce(new Error("Network Error"));
    mount(<NewShopScreen />);
    fireEvent.change(screen.getByPlaceholderText("Продукты 24"), { target: { value: "Лавка у моста" } });
    fireEvent.click(screen.getByText("Добавить фото"));
    await waitFor(() => expect(useToastStore.getState().toast?.message).toMatch(/фото осталось на телефоне/));
  }

  it("не загрузился — остаётся файлом и ложится в очередь копией в папке приложения", async () => {
    await shootOffline();
    apiMock.uploadFile.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(screen.getByText("Создать магазин"));

    await waitFor(() => expect(useShopQueue.getState().shops).toHaveLength(1));
    const [shop] = useShopQueue.getState().shops;
    expect(fs.copyAsync).toHaveBeenCalledWith({ from: CAM, to: shop.photoUri });
    expect(shop.photoUri?.startsWith("file:///doc/")).toBe(true);
    expect(shop.input.photoUrl).toBeUndefined();
  });

  it("загрузился при «Создать», а магазин нет — в очереди ссылка, файл второй раз не нужен", async () => {
    await shootOffline();
    apiMock.uploadFile.mockResolvedValueOnce("https://s3/shops/9.jpg");
    apiMock.createShop.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(screen.getByText("Создать магазин"));

    await waitFor(() => expect(useShopQueue.getState().shops).toHaveLength(1));
    const [shop] = useShopQueue.getState().shops;
    expect(shop.input.photoUrl).toBe("https://s3/shops/9.jpg");
    expect(shop.photoUri).toBeUndefined();
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });
});

describe("вкладка «Магазины»: ждущий магазин", () => {
  it("ждёт — видно, заказ на него открывается с временным id", () => {
    useShopQueue.setState({ shops: [pending()] });
    mount(<PendingShops />);
    expect(screen.getByText("Новый · ждёт отправки")).toBeTruthy();
    // Ждёт и ничего не сорвалось — убирать нечего.
    expect(screen.queryByText("Убрать")).toBeNull();
    fireEvent.click(screen.getByText("Заказ"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/order/new", params: { shopId: String(LOCAL), shopName: "Новая точка" } });
  });

  it("отвергнут — причина и «Повторить», который шлёт снова с тем же ключом и отпускает заказ", async () => {
    useShopQueue.setState({ shops: [pending({ status_: "failed", retryable: false, error: "Территория не найдена" })] });
    useOfflineStore.setState({ orders: [{ id: "o1", shopName: "Новая точка", createdAt: new Date().toISOString(), synced: false, ownerId: 10,
      input: { shopId: LOCAL, items: [{ productId: 7, quantity: 1, unitPrice: 12000 }], idempotencyKey: "1b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" } }] });
    mount(<PendingShops />);
    expect(screen.getByText(/Территория не найдена/)).toBeTruthy();
    expect(screen.getByText(/1 заказ ждёт его отправки/)).toBeTruthy();
    expect(screen.queryByText("Заказ")).toBeNull();

    apiMock.createShop.mockResolvedValue({ id: 777 });
    apiMock.createOrder.mockResolvedValue({ id: 1, total: 12000 });
    fireEvent.click(screen.getByText("Повторить"));
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalledWith(expect.objectContaining({ shopId: 777 })));
    expect(apiMock.createShop).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: KEY }));
    await waitFor(() => expect(useShopQueue.getState().shops).toEqual([]));
  });
});

describe("вкладка «Заказы»: заказ на новый магазин", () => {
  const queued = (id: string, shopId: number) => ({ id, shopName: "Новая точка", createdAt: new Date().toISOString(), synced: false, ownerId: 10, status: "pending" as const,
    input: { shopId, items: [{ productId: 7, quantity: 1, unitPrice: 12000 }], idempotencyKey: "1b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" } });

  it("ждёт магазин — так и сказано; магазин отвергнут — сказано, и заказ можно убрать", async () => {
    useShopQueue.setState({ shops: [pending(), pending({ localId: LOCAL - 1, status_: "failed", retryable: false, error: "Территория не найдена" })] });
    useOfflineStore.setState({ orders: [queued("o1", LOCAL), queued("o2", LOCAL - 1)] });
    // «Удалить» в окне подтверждения нажато сразу.
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.[1]?.onPress?.(); });

    mount(<OrdersScreen />);
    expect(await screen.findByText("Ждёт отправки нового магазина")).toBeTruthy();
    expect(screen.getByText("Новый магазин не принят — заказ не уйдёт")).toBeTruthy();
    // Выход — только у того, что сам не уйдёт.
    expect(screen.getAllByText("Удалить из очереди")).toHaveLength(1);

    fireEvent.click(screen.getByText("Удалить из очереди"));
    await waitFor(() => expect(useOfflineStore.getState().orders.map(o => o.id)).toEqual(["o1"]));
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("очередь магазинов ещё не прочитана (холодный старт) — заказ ждёт, удалить его не предлагают", async () => {
    // Магазин лежит на диске, но память ещё пуста: пустой список не значит «пропал».
    useShopQueue.setState({ shops: [], loaded: false });
    useOfflineStore.setState({ orders: [queued("o1", LOCAL)] });
    mount(<OrdersScreen />);
    expect(await screen.findByText("Ждёт отправки нового магазина")).toBeTruthy();
    expect(screen.queryByText("Новый магазин не принят — заказ не уйдёт")).toBeNull();
    expect(screen.queryByText("Удалить из очереди")).toBeNull();
  });

  it("ручная отправка — сначала новый магазин, следом заказ на него с настоящим id", async () => {
    useShopQueue.setState({ shops: [pending()] });
    useOfflineStore.setState({ orders: [queued("o1", LOCAL)] });
    apiMock.createShop.mockResolvedValue({ id: 808 });
    apiMock.createOrder.mockResolvedValue({ id: 1, total: 12000 });

    mount(<OrdersScreen />);
    fireEvent.click(await screen.findByText("Нажмите для повторной отправки"));
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalledWith(expect.objectContaining({ shopId: 808 })));
    expect(apiMock.createShop).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: KEY }));
  });
});

describe("запуск прохода", () => {
  it("AutoSync: сначала новый магазин, следом заказ на него — уже с настоящим id", async () => {
    useShopQueue.setState({ shops: [pending()] });
    useOfflineStore.setState({ orders: [{ id: "o1", shopName: "Новая точка", createdAt: new Date().toISOString(), synced: false, ownerId: 10, status: "pending",
      input: { shopId: LOCAL, items: [{ productId: 7, quantity: 1, unitPrice: 12000 }], idempotencyKey: "1b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" } }] });
    useAuthStore.setState({ isAuthenticated: true });
    apiMock.createShop.mockResolvedValue({ id: 909 });
    apiMock.createOrder.mockResolvedValue({ id: 1, total: 12000 });

    mount(<AutoSync />);
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalledWith(expect.objectContaining({ shopId: 909 })));
    expect(apiMock.createShop).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: KEY }));
    expect(apiMock.createShop.mock.invocationCallOrder[0]).toBeLessThan(apiMock.createOrder.mock.invocationCallOrder[0]);
    // Ни одной попытки с временным id.
    expect(apiMock.createOrder.mock.calls.every((c: any[]) => c[0].shopId === 909)).toBe(true);
    await waitFor(() => expect(useOfflineStore.getState().orders.filter(o => !o.synced)).toEqual([]));
  });

  it("плашка считает только свои ждущие магазины", () => {
    // Магазин сменщика на общем телефоне: у этого агента его нет ни на вкладке, ни в проходе.
    useShopQueue.setState({ shops: [pending({ ownerId: 77 })] });
    const other = mount(<OfflineBanner />);
    expect(screen.queryByText(/магазин/)).toBeNull();
    other.unmount();

    useShopQueue.setState({ shops: [pending(), pending({ localId: LOCAL - 1, ownerId: 77 })] });
    mount(<OfflineBanner />);
    expect(screen.getByText("1 магазин ожидает отправки")).toBeTruthy();
  });

  it("очередь читается при старте, карточки ждущих магазинов — на вкладке «Магазины»", () => {
    expect(readFileSync("app/_layout.tsx", "utf8")).toContain("void useShopQueue.getState().load();");
    expect(readFileSync("app/(tabs)/shops.tsx", "utf8")).toContain("<PendingShops />");
  });
});

// ── Плашка: только свои записи ──────────────────────────────────────────────
describe("плашка считает только свою работу", () => {
  it("заказы, отметки и визиты сменщика и ничьи не считаются", () => {
    const { useVisitQueue } = require("../store/visit-queue");
    const now = new Date().toISOString();
    const order = (id: string, ownerId?: number) => ({ id, shopName: "Точка", createdAt: now, synced: false, ownerId,
      input: { shopId: 1, items: [{ productId: 7, quantity: 1, unitPrice: 12000 }] } });
    const action = (id: string, ownerId?: number) => ({ id, action: { type: "markOutForDelivery" as const, orderId: 41 }, createdAt: now, synced: false, ownerId });
    useOfflineStore.setState({ orders: [order("o1", 10), order("o2", 77), order("o3")], deliveryActions: [action("d1", 10), action("d2", 77)] });
    useVisitQueue.setState({ actions: [{ id: "v1", planId: 5, status: "visited", createdAt: now, synced: false, ownerId: 10 },
      { id: "v2", planId: 6, status: "visited", createdAt: now, synced: false, ownerId: 77 }] });
    mount(<OfflineBanner />);
    expect(screen.getByText("1 заказ, 1 отметка доставки и 1 визит ожидают отправки")).toBeTruthy();
    useVisitQueue.setState({ actions: [] });
  });
});

// ── 403 при истёкшей подписке ───────────────────────────────────────────────
/*
  403 повторяемый: подписка истекла — магазин уйдёт сам после продления. Но
  тот же 403 приходит, когда роль агента больше не заводит магазины, и тогда
  навсегда. Без «Убрать» у повторяемой неудачи магазин и его заказы висели бы
  вечно. Нарочная поломка: «Убрать» снова только у отвергнутого — падает.
*/
describe("вкладка «Магазины»: 403 при истёкшей подписке", () => {
  it("причина на карточке, магазин ждёт и уйдёт сам — но «Убрать» есть: 403 бывает и навсегда", async () => {
    useShopQueue.setState({ shops: [pending({ status_: "failed", retryable: true, error: "Подписка истекла" })] });
    useOfflineStore.setState({ orders: [{ id: "o1", shopName: "Новая точка", createdAt: new Date().toISOString(), synced: false, ownerId: 10,
      input: { shopId: LOCAL, items: [{ productId: 7, quantity: 1, unitPrice: 12000 }], idempotencyKey: "1b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" } }] });
    // «Убрать» в окне подтверждения нажато сразу.
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.[1]?.onPress?.(); });
    try {
      mount(<PendingShops />);
      expect(screen.getByText(/Подписка истекла/)).toBeTruthy();
      expect(screen.getByText("Новый · ждёт отправки")).toBeTruthy();
      expect(screen.getByText("Заказ")).toBeTruthy();

      fireEvent.click(screen.getByText("Убрать"));
      // Спрошено так же, как у отвергнутого: с заказами, которые уйдут вместе с ним.
      expect(alert).toHaveBeenCalledWith("Убрать магазин?", expect.stringContaining("1 заказ на него"), expect.anything());
      await waitFor(() => expect(useShopQueue.getState().shops).toEqual([]));
      expect(useOfflineStore.getState().orders).toEqual([]);
    } finally {
      alert.mockRestore();
    }
  });
});

// ── Кэш запросов при смене человека ─────────────────────────────────────────
/*
  Ключи вида ["myOrders"] без номера человека: Б, вошедший вскоре после А,
  видел заказы А из кэша, и их даже не перезапрашивали. Проверяется кэш самого
  приложения (queryClient из app/_layout), а не свой: нарочные поломки —
  убрать client.clear() из forgetOnPersonSwitch или саму строку
  forgetOnPersonSwitch(queryClient) — проверку роняют обе.
*/
describe("вошёл другой человек — кэш запросов прежнего стирается", () => {
  it("Б не видит заказ А до ответа сервера; тот же А после 401 своё не теряет", async () => {
    const A = { id: 10, name: "Агент А", role: "agent" };
    const B = { id: 11, name: "Агент Б", role: "agent" };
    const client = queryClient;
    const show = () => render(<QueryClientProvider client={client}><OrdersScreen /></QueryClientProvider>);
    try {
      apiMock.getMyOrders.mockResolvedValueOnce([{ id: 1, orderNumber: "ЗК-1", shopName: "Лавка А", total: "1000", status: "new", createdAt: new Date().toISOString() }]);
      const forA = show();
      expect(await screen.findByText("Лавка А")).toBeTruthy();
      forA.unmount();

      // 401 и снова А — кэш его.
      useAuthStore.setState({ user: null });
      useAuthStore.setState({ user: A as never });
      expect(client.getQueryData(["myOrders"])).toHaveLength(1);

      // Выход, вход Б; сервер Б ещё не ответил.
      useAuthStore.setState({ user: null });
      apiMock.getMyOrders.mockReturnValueOnce(new Promise(() => {}));
      useAuthStore.setState({ user: B as never });
      show();
      await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
      expect(screen.queryByText("Лавка А")).toBeNull();
      // И запрос за заказами Б ушёл, а не был «свежим» из кэша А.
      expect(apiMock.getMyOrders).toHaveBeenCalledTimes(2);
    } finally {
      client.clear();
    }
  });
});
