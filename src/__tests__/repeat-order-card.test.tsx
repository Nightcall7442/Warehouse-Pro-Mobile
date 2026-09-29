/**
 * «Повторить заказ» из карточки заказа.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Из карточки прошлого заказа повторить его было нечем: агент открывал новый
 * заказ, выбирал тот же магазин и набирал те же 10–30 позиций заново. Сервер
 * отдаёт состав заказа по сегодняшним ценам и остатку (order.repeatDraft по
 * orderId), а снятые с продажи товары — отдельным списком по именам.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящая карточка и настоящий экран нового заказа, связанные параметрами
 * маршрута, которые карточка передаёт:
 *   · нажатие спрашивает черновик по orderId и открывает оформление этому
 *     магазину сразу на шаге состава, с составом и пометкой о снятых;
 *   · цена строки — ступенью каталога магазина, заказ уходит обычным create;
 *   · отказ сервера — его словами, без перехода; курьеру кнопки нет;
 *   · мусор в параметрах — пустая корзина, а не падение экрана.
 */

const mockRouteParams: Record<string, string> = {};
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

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
  getProducts: jest.fn(),
  getAvailableShops: jest.fn(),
  getRepeatDraft: jest.fn(),
  getOrderById: jest.fn(),
  getOrderComments: jest.fn(async () => []),
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));
// Карточка проявляется анимацией; нативной части в jest нет.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
jest.mock("../store/recentShops", () => ({
  getRecentShopIds: jest.fn(async () => []),
  addRecentShop: jest.fn(async () => {}),
}));

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewOrderScreen from "../../app/order/new";
import OrderDetailScreen from "../../app/order/[id]";
import { linesFromRepeatParam, repeatParams, skippedFromParam } from "../lib/repeat-order";
import { useOfflineStore } from "../store/offline";
import { useCartStore } from "../store/cart";
import { useAuthStore } from "../store/auth";
import { useToastStore } from "../store/toast";

const apiMock = require("../api");

const tier = (minQuantity: string, price: string, priority = 0) => ({ minQuantity, price, priority });
const SUGAR = { id: 7, name: "Сахар 1 кг", code: "S1", unitPrice: "11000.00", available: "100.000", unit: "kg", tiers: [tier("1.00", "11000.00"), tier("10.00", "9000.00")] };
const TEA = { id: 9, name: "Чай зелёный", code: "T1", unitPrice: "5000.00", available: "50.000", unit: "pcs", tiers: null };

const ORDER = {
  id: 1, orderNumber: "A-1", status: "delivered", createdAt: "2026-09-20T08:00:00.000Z",
  total: "113000.00", subtotal: "113000.00", discount: "0.00",
  shop: { id: 5, name: "Магазин у дороги" },
  items: [{ id: 11, productId: 7, productName: "Сахар 1 кг", quantity: "12.00", unitPrice: "9000.00", subtotal: "108000.00", unit: "kg" }],
};
/** Черновик: цена строки — при её количестве (сахар 12 — ступень 9 000). */
const DRAFT = {
  shop: { id: 5, name: "Магазин у дороги" },
  source: { id: 1, orderNumber: "A-1", createdAt: "2026-09-20T08:00:00.000Z" },
  lines: [
    { productId: 7, name: "Сахар 1 кг", code: "S1", unit: "kg", quantity: "12.00", unitPrice: "9000.00", available: "100.000" },
    { productId: 9, name: "Чай зелёный", code: "T1", unit: "pcs", quantity: "3.00", unitPrice: "5000.00", available: "50.000" },
  ],
  skipped: [{ productId: 99, name: "Лимонад снятый", quantity: "2.00" }],
  lastTime: [],
};

beforeEach(() => {
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  mockRouter.push.mockReset();
  apiMock.createOrder.mockReset();
  apiMock.getRepeatDraft.mockReset();
  apiMock.getOrderById.mockReset();
  apiMock.getProducts.mockReset();
  apiMock.getProducts.mockResolvedValue([SUGAR, TEA]);
  useCartStore.setState({ carts: {} });
  useOfflineStore.setState({ orders: [] });
  useToastStore.setState({ toast: null });
  useAuthStore.setState({ user: { id: 1, name: "Агент", role: "agent" } as never });
});

function renderCard() {
  Object.assign(mockRouteParams, { id: "1" });
  apiMock.getOrderById.mockResolvedValue(ORDER);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OrderDetailScreen /></QueryClientProvider>);
}

describe("карточка заказа: «Повторить заказ»", () => {
  it("спрашивает черновик по orderId и открывает оформление этому магазину с составом; заказ уходит обычным create", async () => {
    apiMock.getRepeatDraft.mockResolvedValue(DRAFT);
    apiMock.createOrder.mockResolvedValue({ id: 2 });
    const card = renderCard();

    fireEvent.click(await screen.findByText("Повторить заказ"));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    expect(apiMock.getRepeatDraft).toHaveBeenCalledWith({ orderId: 1 });
    const { pathname, params } = mockRouter.push.mock.calls[0][0];
    expect(pathname).toBe("/order/new");
    expect(params).toMatchObject({ shopId: "5", shopName: "Магазин у дороги", repeatOf: "A-1" });

    // Экран нового заказа — с теми параметрами, что передала карточка.
    card.unmount();
    for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
    Object.assign(mockRouteParams, params);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);

    // Сразу шаг состава, окно выбора не лезет поверх набранного.
    expect(await screen.findByDisplayValue("12")).toBeTruthy();
    expect(screen.getByDisplayValue("3")).toBeTruthy();
    expect(screen.queryByTestId("picker-summary")).toBeNull();
    expect(screen.getByTestId("repeat-notice").textContent).toMatch(/Повтор заказа #A-1/);
    expect(screen.getByTestId("repeat-skipped").textContent).toMatch(/Лимонад снятый/);
    // Цена сахара — ступенью каталога магазина при 12 (а не карточкой за штуку).
    await waitFor(() => expect(apiMock.getProducts).toHaveBeenCalledWith(undefined, 5));
    expect(await screen.findByText(/^9 000 сум/)).toBeTruthy();

    fireEvent.click(screen.getByText("Продолжить →"));
    fireEvent.click(await screen.findByText("Подтвердить заказ"));
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalled());
    expect(apiMock.createOrder.mock.calls[0][0].shopId).toBe(5);
    expect(apiMock.createOrder.mock.calls[0][0].items).toEqual([
      { productId: 7, quantity: 12, unitPrice: 9000, discount: 0 },
      { productId: 9, quantity: 3, unitPrice: 5000, discount: 0 },
    ]);
  }, 20_000);

  it("отказ сервера — его словами и без перехода", async () => {
    apiMock.getRepeatDraft.mockRejectedValue(Object.assign(new Error("Request failed with status code 403"), {
      response: { status: 403, data: { error: { message: "Заказ оформил другой сотрудник" } } },
    }));
    renderCard();

    fireEvent.click(await screen.findByText("Повторить заказ"));
    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe("Заказ оформил другой сотрудник"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Кнопка снова доступна: повторное нажатие спрашивает ещё раз.
    fireEvent.click(screen.getByText("Повторить заказ"));
    await waitFor(() => expect(apiMock.getRepeatDraft).toHaveBeenCalledTimes(2));
  }, 15_000);

  it("курьеру кнопки нет — оформлять заказы ему сервер не даст", async () => {
    useAuthStore.setState({ user: { id: 3, name: "Курьер", role: "courier" } as never });
    renderCard();

    expect(await screen.findByText(/Заказ #A-1/)).toBeTruthy();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByText("Повторить заказ")).toBeNull();
  }, 15_000);
});

describe("параметры повтора", () => {
  it("туда и обратно без потерь; мусор — пустая корзина", () => {
    const p = repeatParams(DRAFT);
    expect(linesFromRepeatParam(p.repeatLines)).toEqual([
      { productId: 7, name: "Сахар 1 кг", unitPrice: 9000, quantity: "12", discount: "0", available: 100, unit: "kg" },
      { productId: 9, name: "Чай зелёный", unitPrice: 5000, quantity: "3", discount: "0", available: 50, unit: "pcs" },
    ]);
    expect(skippedFromParam(p.repeatSkipped)).toEqual(["Лимонад снятый"]);
    expect(linesFromRepeatParam("{не json")).toEqual([]);
    expect(linesFromRepeatParam(JSON.stringify([{ productId: "x", quantity: "1" }, { productId: 7, quantity: "0" }]))).toEqual([]);
    expect(skippedFromParam("[1, null]")).toEqual([]);
  });
});
