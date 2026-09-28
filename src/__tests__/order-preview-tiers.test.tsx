/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ступени прайс-листа в предпросмотре заказа.
 *
 * Сервер считает заказ по ступеням («от 10 — 9 000»), а телефон знал только
 * цену одной штуки: строка, «Итог» и сумма, отложенная в офлайн-очередь,
 * шли по 11 000, а заказ создавался по 9 000. Агент называл магазину одну
 * сумму, накладная печаталась на другую.
 *
 * Проверки поведенческие: настоящий экран заказа, настоящее окно правки и
 * настоящие помощники денег. Каждая падает, если цена снова берётся при
 * одной штуке, не пересчитывается от количества или не переставляется при
 * смене магазина. Само правило выбора ступени — price-tiers.test.ts.
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
  getProducts: jest.fn(),
  getAvailableShops: jest.fn(),
  // Карточка заказа — окно правки и его каталог.
  getOrderById: jest.fn(),
  getOrderComments: jest.fn(async () => []),
  updateOrderItems: jest.fn(),
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
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
jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));
// Карточка заказа плавно проявляется; нативной части анимаций в jest нет, и
// модуль падает на импорте. Здесь проверяется окно правки, не анимация.
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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewOrderScreen from "../../app/order/new";
import OrderDetailScreen from "../../app/order/[id]";
import { OrderEditModal } from "../components/order/OrderEditModal";
import { linePrice, lineTotal, orderTotals } from "../lib/order-money";
import { bumpLine, cartSummary } from "../lib/cart";
import { useOfflineStore } from "../store/offline";
import { useCartStore } from "../store/cart";
import { useAuthStore } from "../store/auth";
import type { ThemeColors } from "../theme";

const apiMock = require("../api");

// Параметры маршрута у каждого теста свои: «fromCart» или «productId»,
// оставшийся от соседа, открыл бы экран не с той дороги.
beforeEach(() => {
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  useCartStore.setState({ carts: {} });
  // Заказ оформляет вошедший: без него экран не отправляет и не кладёт в очередь.
  useAuthStore.setState({ user: { id: 1, name: "Агент", role: "agent" } as never });
});

const tier = (minQuantity: string, price: string, priority = 0) => ({ minQuantity, price, priority });
/** «от одной штуки — 11 000, от 10 — 9 000»: так каталог отдаёт товар со ступенью. */
const TIERS = [tier("1.00", "11000.00"), tier("10.00", "9000.00")];

describe("цена строки — по ступеням и количеству", () => {
  it("количество переставляет цену; без ступеней — цена каталога при любом количестве", () => {
    expect(["1", "9", "10", "25", "", "0.5"].map(quantity => linePrice({ unitPrice: 11000, tiers: TIERS, quantity })))
      .toEqual([11000, 11000, 9000, 9000, 11000, 11000]);
    // Сервер до ступеней поля tiers не присылает — тогда всё как было.
    expect(linePrice({ unitPrice: 11000, quantity: "100" })).toBe(11000);
    expect(linePrice({ unitPrice: 11000, tiers: null, quantity: "100" })).toBe(11000);
  });

  it("сумма строки, итог заказа и корзина окна выбора считают по ступени", () => {
    expect(lineTotal({ unitPrice: 11000, tiers: TIERS, quantity: "10", discount: "10" })).toBe(81000);
    expect(orderTotals([{ unitPrice: 11000, tiers: TIERS, quantity: "10" }, { unitPrice: 500, quantity: "2" }]).subtotal).toBe(91000);
    const lines = bumpLine([], { id: 7, name: "Сахар", unitPrice: "11000.00", available: "100", tiers: TIERS }, 10);
    expect(cartSummary(lines).total).toBe(90000);
  });
});

// ── Экран нового заказа ─────────────────────────────────────────────────────
const SHOPS = [{ id: 5, name: "Магазин у дороги", city: "Ташкент" }, { id: 6, name: "Лавка у рынка", city: "Ташкент" }];
const sugar = (unitPrice: string, tiers: any) => ({ id: 7, name: "Сахар 1 кг", code: "S1", unitPrice, available: "100.000", unit: "kg", tiers });
/** Каталог по магазину: у каждого свои цены и ступени, без магазина — карточка. */
const CATALOGS: Record<number, any[]> = {
  0: [sugar("12000.00", null)],
  5: [sugar("11000.00", TIERS)],
  6: [sugar("11500.00", [tier("10.00", "8000.00")])],
};

async function openWizardAtTen() {
  apiMock.getAvailableShops.mockResolvedValue(SHOPS);
  apiMock.getProducts.mockImplementation(async (_search?: string, shopId?: number) => CATALOGS[shopId ?? 0]);
  // Заказ со сканера: цена в параметрах — карточки, 12 000.
  Object.assign(mockRouteParams, { productId: "7", productName: "Сахар 1 кг", productPrice: "12000.00" });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText("Магазин у дороги"));
  // Цена магазина, а не карточки из параметров сканера.
  await screen.findByText(/^11 000 сум/);

  fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "10" } });
  // Десять — ступень «от 10»: и цена единицы, и сумма строки.
  expect(screen.getByText(/^9 000 сум/)).toBeTruthy();
  expect(screen.getByText("90 000")).toBeTruthy();
}

describe("новый заказ показывает и отправляет цену ступени", () => {
  beforeEach(() => {
    apiMock.createOrder.mockReset();
    useOfflineStore.setState({ orders: [] });
  });

  it("«Итог» и отправленная цена — по ступени", async () => {
    apiMock.createOrder.mockResolvedValue({ id: 1 });
    await openWizardAtTen();

    fireEvent.click(screen.getByText("Продолжить →"));
    expect(await screen.findByText("90 000 сум")).toBeTruthy();

    fireEvent.click(screen.getByText("Подтвердить заказ"));
    await waitFor(() => expect(apiMock.createOrder).toHaveBeenCalled());
    expect(apiMock.createOrder.mock.calls[0][0].items).toEqual([
      { productId: 7, quantity: 10, unitPrice: 9000, discount: 0 },
    ]);
  }, 15_000);

  it("офлайн-очередь запоминает названную сумму по ступени", async () => {
    apiMock.createOrder.mockRejectedValue(new Error("Network Error"));
    await openWizardAtTen();

    fireEvent.click(screen.getByText("Продолжить →"));
    fireEvent.click(await screen.findByText("Подтвердить заказ"));

    await waitFor(() => expect(useOfflineStore.getState().orders).toHaveLength(1));
    const queued = useOfflineStore.getState().orders[0] as any;
    // По цене одной штуки здесь было бы 110 000 — и после синхронизации агент
    // получил бы «цена изменилась», хотя не менялось ничего.
    expect(queued.quotedTotal).toBe(90000);
    expect(queued.input.items[0].unitPrice).toBe(9000);
  }, 15_000);

  it("смена магазина переставляет цены уже набранных строк", async () => {
    await openWizardAtTen();

    // Назад на выбор магазина — кнопка со стрелкой в шапке.
    fireEvent.click(document.querySelector('feather[name="arrow-left"]') as Element);
    fireEvent.click(await screen.findByText("Лавка у рынка"));

    // У второй лавки ступень «от 10» — 8 000: строка не везёт цены первой.
    expect(await screen.findByText("80 000")).toBeTruthy();
    expect(screen.queryByText("90 000")).toBeNull();
  }, 15_000);
});

// ── Окно правки заказа ──────────────────────────────────────────────────────
const colors = {
  bg: { secondary: "#fff", card: "#f7f7f7", input: "#eee", elevated: "#e0e0e0" },
  text: { primary: "#000", secondary: "#444", tertiary: "#666", muted: "#999" },
  border: { default: "#ddd", subtle: "#eee", full: "#ccc" },
  accent: { primary: "#3b6fe0" },
  brand: { ink: "#ffffff" },
  status: { danger: "#d45050" },
} as unknown as ThemeColors;

describe("правка заказа: добавленная строка — по ступени", () => {
  it("сумма в окне — ступень при набранном количестве; цену на сервер окно не шлёт", () => {
    const onSaveItems = jest.fn();
    render(
      <OrderEditModal
        visible notes="" discount="" saving={false}
        items={[{ id: 1, productId: 70, productName: "Молоко", quantity: 3, unitPrice: 12000, unit: "kg" }]}
        onNotesChange={jest.fn()} onDiscountChange={jest.fn()}
        onSaveItems={onSaveItems} onSave={jest.fn()} onClose={jest.fn()}
        onNeedCatalog={jest.fn()}
        catalog={[{ id: 7, name: "Сахар 1 кг", unitPrice: "11000.00", unit: "kg", tiers: TIERS }]}
        colors={colors}
      />,
    );
    fireEvent.click(screen.getByText("Добавить товар"));
    fireEvent.click(screen.getByText("Сахар 1 кг"));
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "10" } });

    expect(screen.getByText(/Сумма: 90 000 сум/)).toBeTruthy();
    fireEvent.click(screen.getByText("Сохранить состав"));
    // Ни 11 000, ни 9 000: поля цены в окне нет, и присланное офис записал бы
    // как ручную цену без прайс-листа. Цену строке ставит сервер сам.
    expect(onSaveItems).toHaveBeenCalledWith([{ productId: 7, quantity: 10 }]);
  });
});

// ── Карточка заказа: каталог для окна правки ────────────────────────────────
describe("правка заказа: каталог — магазина и прайс-листа заказа", () => {
  it("окно просит каталог по магазину И прайс-листу заказа, под своим ключом", async () => {
    // Сервер новую строку оценивает по {магазин, прайс-лист заказа}; есть у
    // заказа свой список — только он. Каталог по одному магазину показал бы
    // цены другого списка.
    Object.assign(mockRouteParams, { id: "1" });
    apiMock.getOrderById.mockResolvedValue({
      id: 1, orderNumber: "A-1", status: "new", createdAt: "2026-09-27T08:00:00.000Z",
      total: "36000.00", subtotal: "36000.00", discount: "0.00",
      shop: { id: 5, name: "Магазин у дороги" }, priceListId: 3,
      items: [{ id: 11, productId: 70, productName: "Молоко", quantity: "3.00", unitPrice: "12000.00", subtotal: "36000.00", unit: "kg" }],
    });
    apiMock.getProducts.mockReset();
    apiMock.getProducts.mockResolvedValue([sugar("11000.00", TIERS)]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OrderDetailScreen /></QueryClientProvider>);

    fireEvent.click(await screen.findByText("Изменить"));
    fireEvent.click(screen.getByText("Добавить товар"));

    await waitFor(() => expect(apiMock.getProducts).toHaveBeenCalledWith(undefined, 5, 3));
    await waitFor(() => expect(client.getQueryData(["catalog", "orderEdit", 5, 3])).toHaveLength(1));
  }, 15_000);
});

// ── Новый заказ из корзины каталога ─────────────────────────────────────────
describe("новый заказ из корзины не тянет каталог до выбора магазина", () => {
  it("до магазина каталога нет; выбран магазин — каталог этого магазина", async () => {
    // Корзина набрана по карточке: каталог без магазина ей ничего не даст, а
    // весь каталог организации под ключом ["products", 0] тянулся бы впустую.
    Object.assign(mockRouteParams, { fromCart: "1" });
    useCartStore.setState({ carts: { 1: bumpLine([], { id: 7, name: "Сахар 1 кг", unitPrice: "12000.00", available: "100", unit: "kg" }, 2) } });
    apiMock.getAvailableShops.mockResolvedValue(SHOPS);
    apiMock.getProducts.mockReset();
    apiMock.getProducts.mockImplementation(async (_search?: string, shopId?: number) => CATALOGS[shopId ?? 0]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);

    const shop = await screen.findByText("Магазин у дороги");
    expect(apiMock.getProducts).not.toHaveBeenCalled();

    fireEvent.click(shop);
    await waitFor(() => expect(apiMock.getProducts).toHaveBeenCalledWith(undefined, 5));
    expect(apiMock.getProducts.mock.calls.every((c: unknown[]) => c[1] === 5)).toBe(true);
  }, 15_000);
});
