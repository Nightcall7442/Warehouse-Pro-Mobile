/**
 * «Продать первым» — уценка по сроку на телефоне.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Веб #157: директор уценивает партию, которая не успеет продаться до срока,
 * и сервер срезает по её цене unitPrice и ступени в product.listAll, а к
 * товару добавляет markdown { price, endsOn }. Цены в приложении от этого уже
 * верные — но агент видел обычную карточку среди сотни других: ни бирки, ни
 * «было/стало», ни порядка. Предложить магазину первым то, что сгорит, он
 * мог, только если ему позвонили.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 *   · lib/sell-first: живая уценка (кончившаяся из копии на диске — нет),
 *     порядок «уценённые первыми» без перемешивания прочих, зачёркнутая цена
 *     только когда она выше показанной;
 *   · копия каталога без связи несёт уценку, а для магазина без своих цен
 *     срезает цену карточки потолком — как сервер;
 *   · вкладка «Каталог»: бирка, первыми, фишка «Продать первым · N»,
 *     зачёркнутая прежняя цена; без связи — из cached_products;
 *   · окно «Товары» нового заказа: то же в строке и фишка;
 *   · экран товара: прежняя цена и «продать первым до …».
 *
 * Нарочные поломки (перечислены в PR): убрать sellFirstOnTop из каталога —
 * падает «первыми»; вернуть в offline-copy цену карточки без capAtMarkdown —
 * падает «магазин без своих цен»; убрать проверку срока в liveMarkdown —
 * падают «кончившаяся» и бирка у кефира.
 */
const mockRouteParams: Record<string, string> = {};
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockRouteParams,
  router: mockRouter,
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- настоящий зовёт раз на фокус
    useEffect(() => cb(), []);
  },
}));
jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  getProducts: jest.fn(),
  getCategories: jest.fn(async () => []),
  createOrder: jest.fn(),
  getAvailableShops: jest.fn(async () => []),
  getRepeatDraft: jest.fn(async () => null),
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
jest.mock("../store/recentShops", () => ({
  getRecentShopIds: jest.fn(async () => []),
  addRecentShop: jest.fn(async () => {}),
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
jest.mock("../components/SecureImage", () => ({ SecureImage: () => null }));

import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { liveMarkdown, sellFirstOnTop, sellFirstCount, priceBeforeMarkdown, capAtMarkdown, markdownUntil, todayKey } from "../lib/sell-first";
import { saveOfflineCopy, loadOfflineCopy } from "../lib/offline-copy";
import { useAuthStore } from "../store/auth";
import { useCartStore } from "../store/cart";
import { useOfflineStore } from "../store/offline";
import { useLangStore } from "../i18n";

const api = require("../api");

const FUTURE = "2099-12-31";
const PAST = "2000-01-01";
// Молоко уценено (12 000 → 9 000), батон — нет, у кефира уценка кончилась.
const MILK = { id: 1, name: "Молоко 1 л", code: "M1", category: "Молочное", unitPrice: "9000.00", basePrice: "12000.00", available: "40.000", unit: "pcs", photoUrl: null, tiers: null, markdown: { price: "9000.00", endsOn: FUTURE } };
const BREAD = { id: 2, name: "Батон", code: "B1", category: "Хлеб", unitPrice: "5000.00", basePrice: "5000.00", available: "30.000", unit: "pcs", photoUrl: null, tiers: null, markdown: null };
const KEFIR = { id: 3, name: "Кефир", code: "K1", category: "Молочное", unitPrice: "7000.00", basePrice: "8000.00", available: "20.000", unit: "pcs", photoUrl: null, tiers: null, markdown: { price: "7000.00", endsOn: PAST } };

/** Названия товаров в порядке на экране. */
const order = () => screen.getAllByText(/^(Молоко 1 л|Батон|Кефир)$/).map(e => e.textContent);
const struck = (el: HTMLElement) => getComputedStyle(el).textDecorationLine || getComputedStyle(el).textDecoration || el.style.textDecoration;

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  api.getProducts.mockReset();
  useAuthStore.setState({ user: { id: 1, name: "Агент", role: "agent" } as never });
  useCartStore.setState({ carts: {} });
  useOfflineStore.setState({ orders: [] });
  useLangStore.setState({ lang: "ru" });
});

describe("lib/sell-first", () => {
  it("уценка живая до своего последнего дня включительно, кончившаяся и кривая — нет", () => {
    expect(liveMarkdown(MILK)).toEqual(MILK.markdown);
    expect(liveMarkdown(KEFIR)).toBeNull();
    expect(liveMarkdown(BREAD)).toBeNull();
    expect(liveMarkdown({ markdown: { price: "1", endsOn: "2026-10-04" } }, "2026-10-04")).not.toBeNull();
    expect(liveMarkdown({ markdown: { price: "1", endsOn: "2026-10-03" } }, "2026-10-04")).toBeNull();
    expect(liveMarkdown({ markdown: { price: "1", endsOn: "" } })).toBeNull();
  });

  it("сегодня — по часам телефона, в виде сервера", () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("уценённые — первыми, порядок остальных не тронут", () => {
    const list = [BREAD, KEFIR, { ...BREAD, id: 9, name: "Булка" }, MILK];
    expect(sellFirstOnTop(list).map(p => p.id)).toEqual([1, 2, 3, 9]);
    expect(sellFirstCount(list)).toBe(1);
    expect(list.map(p => p.id)).toEqual([2, 3, 9, 1]);
  });

  it("зачёркнутая цена — только когда прежняя выше показанной", () => {
    expect(priceBeforeMarkdown(MILK)).toBe("12000.00");
    // Магазину по прайс-листу и так дешевле уценки — цена не менялась.
    expect(priceBeforeMarkdown({ ...MILK, unitPrice: "8500.00", basePrice: "8500.00" })).toBeNull();
    // Ступень «от 10» ниже карточки: показанная — цена ступени, прежняя — карточка.
    expect(priceBeforeMarkdown(MILK, "8000.00")).toBe("12000.00");
    expect(priceBeforeMarkdown(KEFIR)).toBeNull();
    expect(priceBeforeMarkdown(BREAD)).toBeNull();
  });

  it("потолок: цена не выше живой уценки", () => {
    expect(capAtMarkdown("12000.00", MILK)).toBe("9000.00");
    expect(capAtMarkdown("8000.00", MILK)).toBe("8000.00");
    expect(capAtMarkdown("8000.00", KEFIR)).toBe("8000.00");
    expect(markdownUntil(MILK.markdown)).toBe("31.12");
  });
});

describe("копия каталога без связи", () => {
  it("уценка лежит в копии; магазину без своих цен цена карточки срезана потолком", async () => {
    await saveOfflineCopy("products", 1, [MILK, BREAD, KEFIR], "shop5");
    const other = await loadOfflineCopy<typeof MILK[]>("products", 1, "shop9");
    expect(other?.cardPrices).toBe(true);
    const byId = new Map(other!.data.map(p => [p.id, p]));
    expect(byId.get(1)?.unitPrice).toBe("9000.00");
    expect(byId.get(1)?.markdown).toEqual(MILK.markdown);
    expect(byId.get(2)?.unitPrice).toBe("5000.00");
    // Кончившаяся уценка цену не режет: сервер её уже не применит.
    expect(byId.get(3)?.unitPrice).toBe("8000.00");
  });

  it("свой магазин — его цена и та же уценка", async () => {
    await saveOfflineCopy("products", 1, [MILK, BREAD], "shop5");
    const own = await loadOfflineCopy<typeof MILK[]>("products", 1, "shop5");
    expect(own?.cardPrices).toBe(false);
    expect(own!.data.find(p => p.id === 1)).toMatchObject({ unitPrice: "9000.00", markdown: MILK.markdown });
  });
});

describe("вкладка «Каталог»", () => {
  const Catalog = () => {
    const Screen = require("../../app/(tabs)/catalog").default;
    return <Screen />;
  };

  it("бирка «Продать первым», первыми, зачёркнутая прежняя цена и срок", async () => {
    api.getProducts.mockResolvedValue([BREAD, KEFIR, MILK]);
    withClient(<Catalog />);
    const badge = await screen.findByTestId("catalog-sell-first-1");
    expect(badge.textContent).toBe("Продать первым");
    expect(screen.queryByTestId("catalog-sell-first-2")).toBeNull();
    expect(screen.queryByTestId("catalog-sell-first-3")).toBeNull();
    expect(order()).toEqual(["Молоко 1 л", "Батон", "Кефир"]);

    const was = screen.getByTestId("catalog-was-1");
    expect(was.textContent?.replace(/\s/g, "")).toContain("12000");
    expect(struck(was)).toContain("line-through");
    expect(screen.getByTestId("catalog-markdown-1").textContent).toContain("до 31.12");
    expect(screen.queryByTestId("catalog-markdown-3")).toBeNull();
  });

  it("фишка «Продать первым · N» оставляет только уценённые и снимается вторым нажатием", async () => {
    api.getProducts.mockResolvedValue([BREAD, KEFIR, MILK]);
    withClient(<Catalog />);
    const chip = await screen.findByTestId("catalog-chip-sell-first");
    expect(chip.textContent).toBe("Продать первым · 1");
    await act(async () => { fireEvent.click(chip); });
    expect(order()).toEqual(["Молоко 1 л"]);
    await act(async () => { fireEvent.click(screen.getByTestId("catalog-chip-sell-first")); });
    expect(order()).toEqual(["Молоко 1 л", "Батон", "Кефир"]);
  });

  it("без уценок фишки нет", async () => {
    api.getProducts.mockResolvedValue([BREAD, KEFIR]);
    withClient(<Catalog />);
    await screen.findByText("Батон");
    expect(screen.queryByTestId("catalog-chip-sell-first")).toBeNull();
  });

  it("без связи — из копии на диске, с уценкой", async () => {
    await AsyncStorage.setItem("cached_products", JSON.stringify([BREAD, MILK]));
    api.getProducts.mockRejectedValue(new Error("Network Error"));
    withClient(<Catalog />);
    expect(await screen.findByText("Офлайн данные")).toBeTruthy();
    expect(screen.getByTestId("catalog-sell-first-1")).toBeTruthy();
    expect(order()).toEqual(["Молоко 1 л", "Батон"]);
  });

  it("по-узбекски", async () => {
    useLangStore.setState({ lang: "uz" });
    api.getProducts.mockResolvedValue([BREAD, MILK]);
    withClient(<Catalog />);
    expect((await screen.findByTestId("catalog-chip-sell-first")).textContent).toBe("Birinchi sotish · 1");
    expect(screen.getByTestId("catalog-sell-first-1").textContent).toBe("Birinchi sotish");
    expect(screen.getByTestId("catalog-markdown-1").textContent).toContain("31.12 gacha");
  });
});

describe("окно «Товары» нового заказа", () => {
  async function openPicker() {
    Object.assign(mockRouteParams, { shopId: "5", shopName: "Магазин у дороги" });
    api.getProducts.mockResolvedValue([BREAD, KEFIR, MILK]);
    const NewOrder = require("../../app/order/new").default;
    withClient(<NewOrder />);
    await screen.findByTestId("picker-thumb-1");
  }

  it("уценённые первыми, в строке — «продать первым» и прежняя цена зачёркнута", async () => {
    await openPicker();
    const thumbs = [...document.querySelectorAll("[data-testid^='picker-thumb-']")].map(e => e.getAttribute("data-testid"));
    expect(thumbs).toEqual(["picker-thumb-1", "picker-thumb-3", "picker-thumb-2"]);
    expect(screen.getByTestId("picker-sell-first-1").textContent).toBe("Продать первым · уценка до 31.12");
    expect(screen.queryByTestId("picker-sell-first-3")).toBeNull();
    const was = screen.getByTestId("picker-was-1");
    expect(was.textContent?.replace(/\s/g, "")).toBe("12000");
    expect(struck(was)).toContain("line-through");
    expect(screen.queryByTestId("picker-was-2")).toBeNull();
  });

  it("фишка оставляет только уценённые", async () => {
    await openPicker();
    const chip = screen.getByTestId("picker-chip-sell-first");
    expect(chip.textContent).toBe("Продать первым · 1");
    await act(async () => { fireEvent.click(chip); });
    await waitFor(() => expect(screen.queryByTestId("picker-thumb-2")).toBeNull());
    expect(screen.getByTestId("picker-thumb-1")).toBeTruthy();
    expect(screen.queryByTestId("picker-thumb-3")).toBeNull();
  });
});

describe("экран товара", () => {
  it("прежняя цена зачёркнута, сказано «продать первым» и до какого дня", async () => {
    Object.assign(mockRouteParams, { id: "1" });
    api.getProducts.mockResolvedValue([MILK, BREAD]);
    const Product = require("../../app/product/[id]").default;
    withClient(<Product />);
    const was = await screen.findByTestId("product-was");
    expect(was.textContent?.replace(/\s/g, "")).toContain("12000");
    expect(struck(was)).toContain("line-through");
    expect(screen.getByTestId("product-sell-first").textContent).toContain("Уценка до 31.12");
  });

  it("у товара без уценки — ни того, ни другого", async () => {
    Object.assign(mockRouteParams, { id: "2" });
    api.getProducts.mockResolvedValue([MILK, BREAD]);
    const Product = require("../../app/product/[id]").default;
    withClient(<Product />);
    await screen.findByText("Батон");
    expect(screen.queryByTestId("product-was")).toBeNull();
    expect(screen.queryByTestId("product-sell-first")).toBeNull();
  });
});
