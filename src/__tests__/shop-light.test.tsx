/**
 * Светофор магазина на телефоне агента: точка в списке и блок в карточке.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * У прилавка агент видел только сумму долга. Что часть его просрочена, что
 * лимит почти выбран, что магазин второй месяц не заказывает при обычной
 * неделе, — узнавал, когда заказ вставал на проверку офиса. Сервер (#155)
 * уже считает светофор (shop.light / shop.lights), директор видит его в вебе,
 * а телефон, с которым агент стоит у магазина, — нет.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 *  1. Блок карточки: цвет → подпись («Грузить рискованно» / «Обратите
 *     внимание» / «Всё в порядке»), причины словами из контракта веба,
 *     плитки (просрочено, лимит, средний чек, с прошлого заказа, последний
 *     визит без заказа), пометка «стоп отгрузки»; узбекский — по-узбекски.
 *  2. Список магазинов агента: светофоры ВСЕХ строк одним запросом
 *     shop.lights (не по запросу на строку), точка у названия нужного цвета;
 *     у супервайзера запроса нет.
 *  3. Без связи: карточка показывает последний полученный светофор с
 *     пометкой «на {время}»; не получали ни разу — блока нет и ошибки нет;
 *     сервер сказал «не ваш» (null) — блока нет, даже если копия есть.
 *     Список без связи — точки из копии.
 *
 * Нарочные поломки (каждая роняет проверки ниже):
 *   • useShopLights зовёт getShopLight на каждую строку вместо пакета — падает 2;
 *   • rememberLights не пишет на диск — падает 3;
 *   • ShopLightCard без пометки savedAt — падает 3;
 *   • tone() путает red и yellow — падает 1 и 2.
 */

const mockRoute: Record<string, string> = {};

jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  getShopLight: jest.fn(),
  getShopLights: jest.fn(async () => []),
  getMyShops: jest.fn(async () => []),
  getAvailableShops: jest.fn(async () => []),
  getAllShopsForSupervisor: jest.fn(async () => []),
  getMyWorkZones: jest.fn(async () => []),
  getShop: jest.fn(),
  getShopForSupervisor: jest.fn(),
  getTerritories: jest.fn(async () => []),
}));
jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) },
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockRoute,
  useFocusEffect: jest.fn(),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-image-picker", () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn() }));

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "../api";
import type { ShopLight } from "../api";
import { useAuthStore } from "../store/auth";
import { useThemeStore } from "../store/theme";
import { useLangStore } from "../i18n";
import { formatMoney } from "../store/branding";
import { ShopLightCard } from "../components/ShopLight";
import { rememberLights, lightStamp } from "../lib/shop-light-cache";

const apiMock = api as unknown as Record<string, jest.Mock>;
const AGENT = { id: 10, name: "Агент", role: "agent" };
// Деньги печатаются с неразрывным пробелом; поиск по тексту сводит пробелы к обычному.
const m = (n: number) => formatMoney(n).replace(/\s/g, " ");

const light = (extra: Partial<ShopLight> = {}): ShopLight => ({
  shopId: 1, color: "green", reasons: [], debt: 0, overdue: 0, oldestOverdueDays: 0, graceDays: 14,
  holdsOrders: false, creditLimit: null, avgCheck: 420000, avgCheckOrders: 6, daysSinceOrder: 3,
  usualIntervalDays: 7, lastNoOrder: null, ...extra,
});
const RED = light({
  shopId: 2, color: "red", debt: 1_200_000, overdue: 800_000, oldestOverdueDays: 40, holdsOrders: true, creditLimit: 1_000_000,
  reasons: [{ code: "overdue", amount: 800_000, oldestDays: 40 }, { code: "over_limit", debt: 1_200_000, limit: 1_000_000 }],
});
const YELLOW = light({
  shopId: 3, color: "yellow", daysSinceOrder: 55, usualIntervalDays: 7,
  reasons: [{ code: "long_pause", daysSince: 55, usualDays: 7 }],
  lastNoOrder: { reason: "has_stock", note: null, date: "2026-10-01" },
});
/** Цвет темы так, как его отдаёт браузер: «#ff7a7a» → «rgb(255, 122, 122)». */
const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const status = () => useThemeStore.getState().colors.status;
const shop = (id: number, name: string) => ({ id, name, status: "active", debt: "0" });

function show(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const settle = () => act(async () => { await new Promise(r => { setTimeout(r, 30); }); });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useLangStore.setState({ lang: "ru", chosen: false });
  useAuthStore.setState({ user: { ...AGENT } as never });
  for (const k of Object.keys(mockRoute)) delete mockRoute[k];
});

describe("1. блок карточки: цвет, причины, плитки", () => {
  it("красный: подпись, обе причины словами контракта, «стоп отгрузки», просрочка и лимит", () => {
    render(<ShopLightCard light={RED} savedAt={null} />);
    expect(screen.getByTestId("shop-light-red")).toBeTruthy();
    expect(getComputedStyle(screen.getByText("Грузить рискованно")).color).toBe(rgb(status().danger));
    expect(screen.getByText(`Просрочено ${m(800_000)}, самый старый — 40 дн.`)).toBeTruthy();
    expect(screen.getByText(`Долг ${m(1_200_000)} больше лимита ${m(1_000_000)}`)).toBeTruthy();
    expect(screen.getByText("Новый заказ встанет на проверку офиса — включена «стоп отгрузки».")).toBeTruthy();
    expect(screen.getByText("самый старый — 40 дн.")).toBeTruthy();
    expect(screen.getByText("занято 120%")).toBeTruthy();
    expect(screen.queryByTestId("shop-light-stamp")).toBeNull();
  });

  it("жёлтый: пауза в заказах, обычный ритм, последний визит без заказа с датой", () => {
    render(<ShopLightCard light={YELLOW} savedAt={null} />);
    expect(screen.getByTestId("shop-light-yellow")).toBeTruthy();
    expect(getComputedStyle(screen.getByText("Обратите внимание")).color).toBe(rgb(status().warning));
    expect(screen.getByText("Не заказывает 55 дн., обычно — раз в 7 дн.")).toBeTruthy();
    expect(screen.getByText("55 дн.")).toBeTruthy();
    expect(screen.getByText("обычно раз в 7 дн.")).toBeTruthy();
    expect(screen.getByText("Есть остаток")).toBeTruthy();
    expect(screen.getByText("01.10.2026")).toBeTruthy();
    expect(screen.getByText("без лимита")).toBeTruthy();
    expect(screen.getByText(m(420000))).toBeTruthy();
  });

  it("зелёный: «Всё в порядке» и строка-объяснение; «стоп отгрузки» не пугает зря", () => {
    render(<ShopLightCard light={light({ holdsOrders: true })} savedAt={null} />);
    expect(screen.getByTestId("shop-light-green")).toBeTruthy();
    expect(getComputedStyle(screen.getByText("Всё в порядке")).color).toBe(rgb(status().success));
    expect(screen.getByText("Долг в норме, заказывает в своём ритме")).toBeTruthy();
    expect(screen.queryByText(/стоп отгрузки/)).toBeNull();
    expect(screen.getByText("не было")).toBeTruthy();
  });

  it("узбекский экран — по-узбекски, фразы контракта", () => {
    useLangStore.setState({ lang: "uz" });
    render(<ShopLightCard light={YELLOW} savedAt={null} />);
    expect(screen.getByText("E'tibor bering")).toBeTruthy();
    expect(screen.getByText("55 kundan beri buyurtma yo'q, odatda — har 7 kunda")).toBeTruthy();
    expect(screen.getByText("Yuklash mumkinmi")).toBeTruthy();
    expect(screen.getByText("Qoldiq bor")).toBeTruthy();
  });
});

describe("2. список магазинов агента: пакетом и точкой", () => {
  it("светофоры всех строк — ОДНИМ запросом shop.lights; точка нужного цвета у названия", async () => {
    const ShopsScreen = require("../../app/(tabs)/shops").default;
    apiMock.getMyShops.mockResolvedValue([shop(3, "Барака"), shop(1, "Хумо"), shop(2, "Нур")]);
    apiMock.getShopLights.mockResolvedValue([light(), RED, YELLOW]);
    show(<ShopsScreen />);
    await screen.findByText("Барака");
    await waitFor(() => expect(screen.getByTestId("shop-light-dot-red")).toBeTruthy());
    const bg = (id: string) => getComputedStyle(screen.getByTestId(id)).backgroundColor;
    expect(bg("shop-light-dot-red")).toBe(rgb(status().danger));
    expect(bg("shop-light-dot-yellow")).toBe(rgb(status().warning));
    expect(bg("shop-light-dot-green")).toBe(rgb(status().success));
    expect(apiMock.getShopLights).toHaveBeenCalledTimes(1);
    expect(apiMock.getShopLights).toHaveBeenCalledWith([1, 2, 3]);
    expect(apiMock.getShopLight).not.toHaveBeenCalled();
    // Точка говорит словами для чтения с экрана: цвет и причина.
    expect(screen.getByTestId("shop-light-dot-yellow").getAttribute("aria-label")).toBe("Обратите внимание. Не заказывает 55 дн., обычно — раз в 7 дн.");
  });

  it("у супервайзера светофор в списке не запрашивается", async () => {
    useAuthStore.setState({ user: { id: 20, name: "Сув", role: "supervisor" } as never });
    const ShopsScreen = require("../../app/(tabs)/shops").default;
    apiMock.getAllShopsForSupervisor.mockResolvedValue([shop(1, "Хумо")]);
    show(<ShopsScreen />);
    await screen.findByText("Хумо");
    await settle();
    expect(apiMock.getShopLights).not.toHaveBeenCalled();
  });

  it("без связи — точки из последнего полученного ответа", async () => {
    await rememberLights(AGENT.id, [RED]);
    const ShopsScreen = require("../../app/(tabs)/shops").default;
    apiMock.getMyShops.mockResolvedValue([shop(2, "Нур")]);
    apiMock.getShopLights.mockRejectedValue(new Error("Network Error"));
    show(<ShopsScreen />);
    await screen.findByText("Нур");
    await waitFor(() => expect(screen.getByTestId("shop-light-dot-red")).toBeTruthy());
  });
});

describe("3. карточка магазина без связи", () => {
  const openCard = async (id: number) => {
    mockRoute.id = String(id);
    apiMock.getShop.mockResolvedValue({ ...shop(id, "Нур"), city: "Urgench" });
    const ShopDetail = require("../../app/shop/[id]").default;
    show(<ShopDetail />);
    await screen.findByText("Нур");
  };

  it("со связью — свежий светофор без пометки, и он отложен на диск", async () => {
    apiMock.getShopLight.mockResolvedValue(RED);
    await openCard(2);
    expect(await screen.findByTestId("shop-light-red")).toBeTruthy();
    expect(screen.queryByTestId("shop-light-stamp")).toBeNull();
    expect(apiMock.getShopLight).toHaveBeenCalledWith(2);
    await waitFor(async () => expect(await AsyncStorage.getItem(`offlineCopy.shopLights.${AGENT.id}`)).toContain("\"shopId\":2"));
  });

  it("без связи, ответ получали раньше — он же, с пометкой «на {время}»", async () => {
    const at = new Date(2026, 9, 2, 10, 42);
    await rememberLights(AGENT.id, [YELLOW], at);
    apiMock.getShopLight.mockRejectedValue(new Error("Network Error"));
    await openCard(3);
    expect(await screen.findByTestId("shop-light-yellow")).toBeTruthy();
    expect(screen.getByText(`на ${lightStamp(at.toISOString())}`)).toBeTruthy();
  });

  it("без связи и без копии — блока нет и ошибки нет", async () => {
    apiMock.getShopLight.mockRejectedValue(new Error("Network Error"));
    await openCard(4);
    await settle();
    expect(screen.queryByTestId(/^shop-light-/)).toBeNull();
    expect(screen.queryByText(/Светофор/)).toBeNull();
  });

  it("сервер ответил «не ваш» (null) — блока нет, даже если копия лежит", async () => {
    await rememberLights(AGENT.id, [RED]);
    apiMock.getShopLight.mockResolvedValue(null);
    await openCard(2);
    await settle();
    expect(screen.queryByTestId("shop-light-red")).toBeNull();
  });

  it("пометка времени: сегодня — часы, раньше — дата и часы", () => {
    const now = new Date(2026, 9, 2, 15, 0);
    expect(lightStamp(new Date(2026, 9, 2, 9, 5).toISOString(), now)).toBe("09:05");
    expect(lightStamp(new Date(2026, 9, 1, 18, 30).toISOString(), now)).toBe("01.10 18:30");
  });
});
