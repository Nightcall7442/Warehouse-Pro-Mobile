/**
 * «Как в прошлый раз» в оформлении заказа.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Заказ магазину почти всегда «как в прошлый раз», а агент набирал 10–30
 * позиций заново, по памяти: сколько магазин брал, в приложении не видно
 * нигде. Сервер уже умеет подсказать (order.repeatDraft, веб PR #138), в
 * вебе есть кнопка и «в прошлый раз: N» — в приложении не было ничего.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящий экран нового заказа и настоящие помощники корзины:
 *   · подсказка спрашивается по магазину заказа (shopId), до выбора
 *     магазина — не спрашивается;
 *   · у товара в окне выбора и у строки корзины — «в прошлый раз: N»;
 *   · кнопка ДОПОЛНЯЕТ корзину: набранное агентом не тронуто, товар с нулём
 *     на складе не положен, повторное нажатие корзину не меняет, цена —
 *     ступенью каталога магазина (lib/price-tiers.ts), заказ уходит обычным
 *     order.create;
 *   · без связи и при отказе (403) — ни кнопки, ни подсказки, ни ошибки.
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
import { fillLikeLastTime, lastTimeMap } from "../lib/repeat-order";
import { bumpLine } from "../lib/cart";
import { linePrice } from "../lib/order-money";
import { useOfflineStore } from "../store/offline";
import { useCartStore } from "../store/cart";
import { useAuthStore } from "../store/auth";
import { useToastStore } from "../store/toast";

const apiMock = require("../api");

const tier = (minQuantity: string, price: string, priority = 0) => ({ minQuantity, price, priority });
/** Сахар: «от одной — 11 000, от 10 — 9 000»; вода — ноль на складе; чай — без ступеней. */
const SUGAR = { id: 7, name: "Сахар 1 кг", code: "S1", unitPrice: "11000.00", available: "100.000", unit: "kg", tiers: [tier("1.00", "11000.00"), tier("10.00", "9000.00")] };
const WATER = { id: 8, name: "Вода 1,5 л", code: "W1", unitPrice: "4000.00", available: "0.000", unit: "pcs", tiers: null };
const TEA = { id: 9, name: "Чай зелёный", code: "T1", unitPrice: "5000.00", available: "50.000", unit: "pcs", tiers: null };
const CATALOG = [SUGAR, WATER, TEA];
const SHOPS = [{ id: 5, name: "Магазин у дороги", city: "Ташкент" }, { id: 6, name: "Лавка у рынка", city: "Ташкент" }];

const DRAFT = {
  shop: { id: 5, name: "Магазин у дороги" },
  source: { id: 40, orderNumber: "A-40", createdAt: "2026-09-20T08:00:00.000Z" },
  lines: [],
  skipped: [{ productId: 99, name: "Лимонад снятый", quantity: "2" }],
  lastTime: [
    { productId: 7, quantity: "12", orders: 3 },
    { productId: 8, quantity: "6", orders: 1 },
    { productId: 9, quantity: "4", orders: 2 },
  ],
};

// Как на экране после нормализации Testing Library: неразрывный пробел — обычный.
const money = (n: number) => n.toLocaleString("ru").replace(/\s/g, " ");

beforeEach(() => {
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  mockRouter.push.mockReset();
  apiMock.createOrder.mockReset();
  apiMock.getRepeatDraft.mockReset();
  apiMock.getProducts.mockReset();
  apiMock.getProducts.mockResolvedValue(CATALOG);
  apiMock.getAvailableShops.mockResolvedValue(SHOPS);
  useCartStore.setState({ carts: {} });
  useOfflineStore.setState({ orders: [] });
  useToastStore.setState({ toast: null });
  useAuthStore.setState({ user: { id: 1, name: "Агент", role: "agent" } as never });
});

function renderForShop(shopId = "5", shopName = "Магазин у дороги") {
  Object.assign(mockRouteParams, { shopId, shopName });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);
  return client;
}

// ── Правило корзины — без экрана ────────────────────────────────────────────
describe("fillLikeLastTime — дополняет, а не переписывает", () => {
  it("кладёт недостающие с подсказанным количеством, набранное не трогает, нулевой остаток и чужой каталогу товар — мимо", () => {
    const mine = bumpLine([], TEA, 1);
    const r = fillLikeLastTime(mine, [...DRAFT.lastTime, { productId: 55, quantity: "3", orders: 1 }], CATALOG);
    expect(r.lines.map(l => [l.productId, l.quantity])).toEqual([[9, "1"], [7, "12"]]);
    expect({ added: r.added, kept: r.kept, missing: r.missing }).toEqual({ added: 1, kept: 1, missing: 2 });
    // Строка из подсказки несёт ступени каталога: цена при 12 — ступень «от 10».
    expect(linePrice(r.lines[1])).toBe(9000);
    expect(r.lines[1].available).toBe(100);
  });

  it("второе нажатие корзину не меняет; пустая подсказка — ничего", () => {
    const once = fillLikeLastTime([], DRAFT.lastTime, CATALOG).lines;
    const twice = fillLikeLastTime(once, DRAFT.lastTime, CATALOG);
    expect(twice.lines).toEqual(once);
    expect(twice.added).toBe(0);
    expect(fillLikeLastTime(once, null, CATALOG).lines).toEqual(once);
    expect(lastTimeMap(undefined).size).toBe(0);
  });
});

// ── Экран нового заказа ─────────────────────────────────────────────────────
describe("мастер заказа: подсказка и кнопка «Как в прошлый раз»", () => {
  it("спрашивает по магазину, показывает «в прошлый раз», кнопка дополняет корзину, заказ уходит обычным create", async () => {
    apiMock.getRepeatDraft.mockResolvedValue(DRAFT);
    apiMock.createOrder.mockResolvedValue({ id: 1 });
    renderForShop();

    // Пустая корзина — окно выбора открыто; подсказка — у товаров каталога.
    expect(await screen.findByTestId("last-time-7")).toBeTruthy();
    expect(apiMock.getRepeatDraft).toHaveBeenCalledWith({ shopId: 5 });
    expect(screen.getByTestId("last-time-7").textContent).toMatch(/в прошлый раз: 12 кг/);
    expect(screen.getByTestId("last-time-9").textContent).toMatch(/в прошлый раз: 4 шт/);
    expect(screen.getByText(/Как в прошлый раз · 3 поз\./)).toBeTruthy();
    expect(screen.getByTestId("last-time-skipped").textContent).toMatch(/Лимонад снятый/);

    // Агент уже положил чай руками — одну штуку.
    fireEvent.click(screen.getByText("Чай зелёный"));
    await waitFor(() => expect(screen.getByTestId("stepper-9")).toBeTruthy());

    fireEvent.click(screen.getByTestId("like-last-time"));
    // Сахар положен с подсказанным количеством; чай — как набрал агент; воды нет на складе.
    await waitFor(() => expect(screen.getByTestId("stepper-7")).toBeTruthy());
    expect(screen.getByTestId("stepper-7").textContent).toContain("12");
    expect(screen.getByTestId("stepper-9").textContent).toContain("1");
    expect(screen.queryByTestId("stepper-8")).toBeNull();
    const toast = useToastStore.getState().toast;
    expect(toast?.variant).toBe("info");
    expect(toast?.message).toMatch(/Добавлено из прошлого раза: 1/);
    expect(toast?.message).toMatch(/не тронуто: 1/);
    expect(toast?.message).toMatch(/нет на складе: 1/);

    // Второе нажатие — корзина та же.
    fireEvent.click(screen.getByTestId("like-last-time"));
    expect(screen.getByTestId("stepper-7").textContent).toContain("12");
    expect(screen.getByTestId("stepper-9").textContent).toContain("1");

    // На шаге состава — те же строки, у строки подсказка, цена — ступенью.
    // (Окно в jsdom не доигрывает анимацию закрытия — строки шага видны и под ним.)
    fireEvent.click(screen.getByTestId("picker-done"));
    expect(await screen.findByDisplayValue("12")).toBeTruthy();
    expect(screen.getByTestId("line-last-time-7").textContent).toMatch(/в прошлый раз: 12 кг/);
    expect(screen.getByText(money(108000))).toBeTruthy();

    fireEvent.click(screen.getByText("Продолжить →"));
    fireEvent.click(await screen.findByText("Подтвердить заказ"));
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalled());
    expect(apiMock.createOrder.mock.calls[0][0].shopId).toBe(5);
    expect(apiMock.createOrder.mock.calls[0][0].items).toEqual([
      { productId: 9, quantity: 1, unitPrice: 5000, discount: 0 },
      { productId: 7, quantity: 12, unitPrice: 9000, discount: 0 },
    ]);
  }, 20_000);

  it("до выбора магазина подсказку не спрашивает; выбран — спрашивает по нему", async () => {
    apiMock.getRepeatDraft.mockResolvedValue({ ...DRAFT, shop: { id: 6, name: "Лавка у рынка" } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);

    fireEvent.click(await screen.findByText("Лавка у рынка"));
    expect(await screen.findByTestId("last-time-7")).toBeTruthy();
    expect(apiMock.getRepeatDraft).toHaveBeenCalledTimes(1);
    expect(apiMock.getRepeatDraft).toHaveBeenCalledWith({ shopId: 6 });
  }, 15_000);

  it.each([
    ["без связи", Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" })],
    ["чужой магазин (403)", Object.assign(new Error("Request failed with status code 403"), { response: { status: 403, data: { error: { message: "Нет доступа" } } } })],
  ])("%s — ни кнопки, ни подсказки, ни ошибки; каталог работает", async (_name, err) => {
    apiMock.getRepeatDraft.mockRejectedValue(err);
    renderForShop();

    expect(await screen.findByText("Чай зелёный")).toBeTruthy();
    await waitFor(() => expect(apiMock.getRepeatDraft).toHaveBeenCalledWith({ shopId: 5 }));
    // Дать отказу дойти до экрана.
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });

    expect(screen.queryByTestId("like-last-time")).toBeNull();
    expect(screen.queryByText(/в прошлый раз/)).toBeNull();
    expect(useToastStore.getState().toast).toBeNull();
    // Товар по-прежнему кладётся руками.
    fireEvent.click(screen.getByText("Чай зелёный"));
    await waitFor(() => expect(screen.getByTestId("stepper-9")).toBeTruthy());
  }, 15_000);

  it("магазин, у которого этот агент ещё не заказывал, — кнопки нет", async () => {
    apiMock.getRepeatDraft.mockResolvedValue({ ...DRAFT, source: null, skipped: [], lastTime: [] });
    renderForShop();

    expect(await screen.findByText("Чай зелёный")).toBeTruthy();
    await waitFor(() => expect(apiMock.getRepeatDraft).toHaveBeenCalled());
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByTestId("like-last-time")).toBeNull();
    expect(screen.queryByTestId("last-time-skipped")).toBeNull();
  }, 15_000);
});
