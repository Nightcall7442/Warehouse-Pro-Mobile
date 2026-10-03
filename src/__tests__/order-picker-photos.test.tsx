/**
 * Фото товара в окне выбора заказа.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Снимки для App Store, 03.10.2026: на шаге «Товары» нового заказа у каждой
 * строки стояла серая коробка, хотя фото у товаров есть и вкладка «Каталог»
 * их показывает. Агент узнаёт товар по упаковке быстрее, чем по названию.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящий экран app/order/new.tsx:
 *   · у товара с фото — картинка точного размера (строка не прыгает);
 *   · ссылка на свой сервер идёт через SecureImage — с адресом API, как в
 *     каталоге; внешняя — как есть;
 *   · без фото — прежняя коробка; положенный в корзину товар с фото
 *     отмечен галочкой поверх фото.
 *
 * Нарочная поломка: вернуть в строку окна выбора одну Feather-иконку —
 * падает первая проверка.
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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewOrderScreen from "../../app/order/new";
import { useOfflineStore } from "../store/offline";
import { useCartStore } from "../store/cart";
import { useAuthStore } from "../store/auth";

const apiMock = require("../api");

const SUGAR = { id: 7, name: "Сахар 1 кг", code: "S1", unitPrice: "11000.00", available: "100.000", unit: "kg", tiers: null, photoUrl: "https://images.example.com/sugar.jpg" };
const WATER = { id: 8, name: "Вода 1,5 л", code: "W1", unitPrice: "4000.00", available: "50.000", unit: "pcs", tiers: null, photoUrl: null };
const TEA = { id: 9, name: "Чай зелёный", code: "T1", unitPrice: "5000.00", available: "50.000", unit: "pcs", tiers: null, photoUrl: "/api/photos/product/9" };

beforeEach(() => {
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  apiMock.getProducts.mockReset();
  apiMock.getProducts.mockResolvedValue([SUGAR, WATER, TEA]);
  apiMock.getAvailableShops.mockResolvedValue([{ id: 5, name: "Магазин у дороги", city: "Ташкент" }]);
  apiMock.getRepeatDraft.mockResolvedValue(null);
  useCartStore.setState({ carts: {} });
  useOfflineStore.setState({ orders: [] });
  useAuthStore.setState({ user: { id: 1, name: "Агент", role: "agent" } as never });
});

function renderForShop() {
  Object.assign(mockRouteParams, { shopId: "5", shopName: "Магазин у дороги" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);
}

/** Адреса картинок внутри миниатюры (react-native-web рисует <img> и фон). */
const imagesIn = (el: HTMLElement) =>
  [...el.querySelectorAll("img")].map(i => i.getAttribute("src")).concat(
    [...el.querySelectorAll<HTMLElement>("[style*=background-image]")].map(d => d.style.backgroundImage),
  ).filter(Boolean).join(" ");

describe("окно выбора товара показывает фото", () => {
  it("у товара с фото — картинка точного размера, без фото — коробка", async () => {
    renderForShop();
    const sugar = await screen.findByTestId("picker-thumb-7");
    await waitFor(() => expect(imagesIn(sugar)).toContain("https://images.example.com/sugar.jpg"));
    expect(sugar.style.width).toBe("44px");
    expect(sugar.style.height).toBe("44px");

    const water = screen.getByTestId("picker-thumb-8");
    expect(imagesIn(water)).toBe("");
    expect(water.querySelector("Feather")?.getAttribute("name")).toBe("package");
  });

  it("своё фото — через SecureImage, с адресом сервера, как в каталоге", async () => {
    renderForShop();
    const tea = await screen.findByTestId("picker-thumb-9");
    await waitFor(() => expect(imagesIn(tea)).toContain("https://test.local/api/photos/product/9"));
  });

  it("положенный в корзину товар с фото отмечен галочкой поверх фото", async () => {
    renderForShop();
    fireEvent.click(await screen.findByText("Сахар 1 кг"));
    await waitFor(() => expect(screen.getByTestId("stepper-7")).toBeTruthy());
    const sugar = screen.getByTestId("picker-thumb-7");
    expect(imagesIn(sugar)).toContain("sugar.jpg");
    expect([...sugar.querySelectorAll("Feather")].map(f => f.getAttribute("name"))).toContain("check");
  });
});
