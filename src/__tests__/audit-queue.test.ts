/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Что происходит с работой агента, когда связь и сессия ведут себя как в поле.
 *
 * Все проверки здесь — поведенческие: они гоняют настоящие стор и перехватчик,
 * а не ищут строки в исходниках. Каждая падает на прежнем коде.
 *
 * Разбираются четыре беды одной смены:
 *   • истёкший за ночь токен помечал накопленные заказы «сервер отказал
 *     навсегда», и после повторного входа они уже не уходили никогда;
 *   • отметка о доставке, поставленная во время прохода синхронизации,
 *     затиралась срезом, снятым до отправки, — заказ снова числился «В пути»;
 *   • переполненное хранилище телефона: заказ не записывался на диск, а экран
 *     рапортовал «сохранён офлайн» и закрывался;
 *   • общий сменный телефон: данные и координаты предыдущего агента
 *     доставались следующему.
 */

const mockRouteParams: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiRemove: jest.fn(async () => {}),
  },
}));

jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => {}),
    deleteItemAsync: jest.fn(async () => {}),
  },
}));

jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  createOrder: jest.fn(),
  markOutForDelivery: jest.fn(),
  markDelivered: jest.fn(),
  markFailed: jest.fn(),
  completeDelivery: jest.fn(),
  getProducts: jest.fn(),
  getAvailableShops: jest.fn(),
  getMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
}));

jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));

// ── Окружение экрана заказа ─────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../store/theme", () => {
  const colors = {
    bg: { primary: "#fff", secondary: "#f7f7f7", card: "#fff", elevated: "#f0f0f0", input: "#e0e0e0" },
    text: { primary: "#000", secondary: "#666", tertiary: "#888", muted: "#999" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0", primaryDim: "#e8edf8", primaryLight: "#5b8cf0" },
    accent: { primary: "#3b6fe0", success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
    status: {
      success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0",
      successDim: "#e8f8f0", warningDim: "#fdf0e0", dangerDim: "#fde8e8", infoDim: "#e8edf8",
    },
  };
  return { useThemeColors: () => colors, useThemeStore: () => ({ isDark: false }) };
});

jest.mock("../store/recentShops", () => ({
  getRecentShopIds: jest.fn(async () => []),
  addRecentShop: jest.fn(async () => {}),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const storage = AsyncStorage as unknown as {
  getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock;
  getAllKeys: jest.Mock; multiRemove: jest.Mock;
};

const { useOfflineStore, isRetryableError } = require("../store/offline");
const { useAuthStore } = require("../store/auth");
const apiMock = require("../api");
const bgLocation = require("../backgroundLocation");

/** Ошибка «сессия недействительна» ровно в том виде, в каком её отдаёт сервер. */
function sessionExpiredError(status = 401) {
  const e = new Error("Требуется вход") as Error & {
    serverRejected?: boolean; trpcMessage?: string; response?: { status: number };
  };
  // 401 приходит конвертом tRPC — с сообщением и пометкой «сервер ответил».
  // Именно поэтому прежний порядок проверок делал ветку статусов недостижимой.
  e.trpcMessage = "Требуется вход";
  e.serverRejected = true;
  e.response = { status };
  return e;
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockImplementation(async () => null);
  storage.setItem.mockImplementation(async () => {});
  storage.removeItem.mockImplementation(async () => {});
  storage.getAllKeys.mockImplementation(async () => []);
  useOfflineStore.setState({ orders: [], deliveryActions: [], loaded: true, syncingOrders: false, syncingActions: false });
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  for (const key of Object.keys(mockRouteParams)) delete mockRouteParams[key];
});

// ── 1. Истёкшая сессия — не отказ по существу ───────────────────────────────
describe("истёкшая сессия не хоронит очередь", () => {
  it("401 с конвертом tRPC считается временным", () => {
    // Прежний порядок: сначала проверялся конверт — и 401 сразу получал
    // «сервер отказал навсегда».
    expect(isRetryableError(sessionExpiredError(401))).toBe(true);
  });

  it("403 (роль сняли, привязку к организации сорвало) — тоже временный", () => {
    expect(isRetryableError(sessionExpiredError(403))).toBe(true);
  });

  it("отказ по существу с тем же конвертом по-прежнему окончателен", () => {
    const e = new Error("Недостаточно товара") as any;
    e.trpcMessage = "Недостаточно товара";
    e.serverRejected = true;
    e.response = { status: 500 };
    expect(isRetryableError(e)).toBe(false);
  });

  it("после 401 заказ снова уходит следующим проходом, а не остаётся красным навсегда", async () => {
    apiMock.createOrder.mockRejectedValue(sessionExpiredError(401));
    useOfflineStore.setState({
      orders: [{
        id: "o1",
        input: { shopId: 1, items: [{ productId: 1, quantity: 2, unitPrice: 1000 }] },
        shopName: "Магазин у дороги",
        createdAt: new Date().toISOString(),
        synced: false,
      }],
    });

    await useOfflineStore.getState().syncAll();
    const afterFirst = useOfflineStore.getState().orders[0];
    expect(afterFirst.synced).toBe(false);
    expect(afterFirst.retryable).toBe(true);

    // Агент вошёл заново — очередь обязана уйти сама. На прежнем коде
    // shouldAutoSync больше не брал эту запись, и второй проход не делал
    // ни одного запроса.
    apiMock.createOrder.mockResolvedValue({ id: 55, total: 2000 });
    const second = await useOfflineStore.getState().syncAll();
    expect(apiMock.createOrder).toHaveBeenCalledTimes(2);
    expect(second.synced).toBe(1);
    expect(useOfflineStore.getState().orders[0].synced).toBe(true);
  });
});

// ── 2. Отметка о доставке, поставленная во время прохода ────────────────────
describe("проход синхронизации не затирает то, что пришло во время него", () => {
  it("отметка о доставке, поставленная в полёте, остаётся и в стейте, и на диске", async () => {
    let finishFlight: (v: unknown) => void = () => {};
    apiMock.markOutForDelivery.mockImplementation(
      () => new Promise((resolve) => { finishFlight = resolve; }),
    );

    useOfflineStore.setState({
      deliveryActions: [{
        id: "a-in-flight",
        action: { type: "markOutForDelivery", orderId: 101 },
        createdAt: new Date().toISOString(),
        synced: false,
      }],
    });

    const pass = useOfflineStore.getState().syncDeliveryActions();
    // Дать проходу дойти до отправки.
    await new Promise((r) => setTimeout(r, 0));

    // Курьер на следующей точке отмечает заказ доставленным с наличными.
    await useOfflineStore.getState().addDeliveryAction({
      id: "a-queued-during",
      action: { type: "markDelivered", orderId: 102, cashAmount: "450000.00" },
      createdAt: new Date().toISOString(),
      synced: false,
    } as any);

    finishFlight({});
    await pass;

    const ids = useOfflineStore.getState().deliveryActions.map((a: any) => a.id);
    expect(ids).toContain("a-queued-during");

    // И то же самое должно лежать на диске: после перезапуска приложения
    // стейт восстанавливается только оттуда.
    const writes = storage.setItem.mock.calls.filter((c: any[]) => c[0] === "pending_delivery_actions");
    const lastWrite = JSON.parse(writes[writes.length - 1][1]);
    expect(lastWrite.map((a: any) => a.id)).toContain("a-queued-during");
  });
});

// ── 3. Переполненное хранилище ──────────────────────────────────────────────
describe("постановка в очередь честно сообщает о неудаче", () => {
  it("addOrder возвращает false, если запись на диск не удалась", async () => {
    storage.setItem.mockRejectedValue(new Error("QUOTA_EXCEEDED"));
    const ok = await useOfflineStore.getState().addOrder({
      id: "o-disk-full",
      input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] },
      shopName: "Магазин",
      createdAt: new Date().toISOString(),
      synced: false,
    } as any);
    // Прежде возвращался undefined, и экран считал заказ сохранённым: стирал
    // черновик, закрывался и показывал «Заказ сохранён офлайн».
    expect(ok).toBe(false);
  });

  it("при удачной записи возвращается true", async () => {
    const ok = await useOfflineStore.getState().addOrder({
      id: "o-ok",
      input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] },
      shopName: "Магазин",
      createdAt: new Date().toISOString(),
      synced: false,
    } as any);
    expect(ok).toBe(true);
  });

  it("addDeliveryAction сообщает о неудаче так же", async () => {
    storage.setItem.mockRejectedValue(new Error("QUOTA_EXCEEDED"));
    const ok = await useOfflineStore.getState().addDeliveryAction({
      id: "a-disk-full",
      action: { type: "markDelivered", orderId: 7, cashAmount: "100000.00" },
      createdAt: new Date().toISOString(),
      synced: false,
    } as any);
    expect(ok).toBe(false);
  });
});

// ── 4. Общий сменный телефон ────────────────────────────────────────────────
describe("смена агента на общем телефоне", () => {
  it("выход останавливает фоновый трекинг и стирает буфер координат", async () => {
    useAuthStore.setState({ user: { id: 1, name: "Агент А" }, isAuthenticated: true });

    await useAuthStore.getState().logout();

    // Иначе точки уходившего агента заливались под сессией сменщика: сервер
    // берёт автора из токена, а время съёмки приходит честное.
    expect(bgLocation.stopBackgroundTracking).toHaveBeenCalled();
    const removed = storage.removeItem.mock.calls.map((c: any[]) => c[0]);
    expect(removed).toContain("pending_locations");
    expect(removed).toContain("gps_auto_track");
  });

  it("вход чистит кэши предыдущей сессии, даже если logout не вызывался", async () => {
    apiMock.login.mockResolvedValue({ user: { id: 2, name: "Агент Б" }, token: "t", success: true });

    await useAuthStore.getState().login("b@example.com", "pass");

    // Сессия предыдущего агента чаще заканчивается ответом 401, а не выходом:
    // тогда черновик заказа оставался на диске, и следующему предлагали
    // «Продолжить черновик?» с чужим магазином, позициями и скидками.
    expect(storage.removeItem.mock.calls.map((c: any[]) => c[0])).toContain("order_draft");
  });

  it("очередь отправки при выходе НЕ трогается — это несделанная работа", async () => {
    useAuthStore.setState({ user: { id: 1, name: "Агент А" }, isAuthenticated: true });
    await useAuthStore.getState().logout();
    const removed = storage.removeItem.mock.calls.map((c: any[]) => c[0]);
    expect(removed).not.toContain("pending_orders");
    expect(removed).not.toContain("pending_delivery_actions");
  });
});

// ── 6. Заказ, начатый со сканера штрих-кода ─────────────────────────────────
describe("заказ со сканера штрих-кода можно оформить", () => {
  it("остаток дочитывается из каталога, а не считается нулевым", async () => {
    apiMock.getAvailableShops.mockResolvedValue([{ id: 5, name: "Магазин у дороги", city: "Ташкент" }]);
    apiMock.getProducts.mockResolvedValue([
      { id: 7, name: "Сахар 1 кг", code: "S1", unitPrice: "12000.00", available: "25.000", unit: "кг" },
    ]);

    // Ровно те параметры, которые кладёт экран сканера: остатка среди них нет.
    mockRouteParams.productId = "7";
    mockRouteParams.productName = "Сахар 1 кг";
    mockRouteParams.productPrice = "12000.00";

    const NewOrderScreen = require("../../app/order/new").default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      React.createElement(QueryClientProvider, { client },
        React.createElement(NewOrderScreen)),
    );

    // Шаг 1 — выбор магазина.
    const shop = await screen.findByText("Магазин у дороги");
    fireEvent.click(shop);

    // Шаг 2 — товар уже в корзине. Прежде здесь стояло «Остаток: 0
    // (превышено!)», кнопка «Продолжить» не нажималась ни при каком
    // количестве, и агент у полки уходил с уверенностью, что товара нет.
    // Экран ждёт две выдачи подряд — магазины, затем каталог.
    await waitFor(() => {
      expect(screen.getByText(/Остаток: 25/)).toBeTruthy();
    });
    expect(screen.queryByText(/превышено/)).toBeNull();
    expect(screen.queryByText(/на складе 0/)).toBeNull();
  // Пятнадцать секунд вместо стандартных пяти: тест поднимает настоящий экран
  // заказа и ждёт две выдачи подряд — магазины, затем каталог. На общем
  // прогоне, где рядом работают два десятка наборов, в пять секунд он
  // укладывался не всегда и падал по бюджету ЦЕЛИКОМ — в выводе это выглядело
  // как «Exceeded timeout of 5000 ms», а не как несошедшаяся проверка.
  }, 15_000);
});

// ── 5. Перехватчик 401 ──────────────────────────────────────────────────────
describe("перехватчик 401 в сетевом слое", () => {
  it("гасит сессию и стирает кэши предыдущего пользователя", async () => {
    jest.resetModules();
    jest.dontMock("../api");

    const handlers: { onError?: (e: unknown) => unknown } = {};
    jest.doMock("axios", () => {
      const instance = {
        interceptors: {
          request: { use: () => {} },
          response: { use: (_ok: unknown, onError: (e: unknown) => unknown) => { handlers.onError = onError; } },
        },
        get: async () => {
          const err = Object.assign(new Error("Request failed with status code 401"), {
            config: { url: "/auth.me" },
            response: { status: 401, data: {} },
          });
          return handlers.onError!(err);
        },
        post: async () => ({ data: {} }),
      };
      const axiosStub = { create: () => instance, isAxiosError: () => true };
      return { __esModule: true, default: axiosStub, ...axiosStub };
    });

    const freshStorage = require("@react-native-async-storage/async-storage").default;
    const { getMe } = require("../api");
    const { useAuthStore: freshAuth } = require("../store/auth");
    freshAuth.setState({ user: { id: 1, name: "Агент А" }, isAuthenticated: true });

    await expect(getMe()).rejects.toBeTruthy();

    expect(freshAuth.getState().isAuthenticated).toBe(false);
    // Раньше здесь стирался только токен, а черновик заказа и кэш магазинов
    // предыдущего агента оставались на диске до следующего logout(), которого
    // могло и не быть.
    expect(freshStorage.removeItem.mock.calls.map((c: any[]) => c[0])).toContain("order_draft");
  });
});
