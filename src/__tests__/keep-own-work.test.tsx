/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 401 не стирает работу человека — и не отдаёт её другому.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Конец сессии (ответ 401, отказ в hydrate, вход) стирал черновик заказа, все
 * черновики визитов и буфер точек GPS. Задумано для сменного телефона, но
 * срабатывало и когда токен просто истёк: мерчандайзер, вошедший обратно через
 * минуту, терял чек-лист на двести позиций, агент — до трёх часов маршрута без
 * связи (дыра на карте, антифрод «не был»).
 *
 * Решение владельца 28.09.2026: не стирать, а разделять по человеку. Черновики
 * лежат под его номером, точки помечены хозяином и уходят только под ним.
 *
 * Второе — копия каталога без связи. Она была одна на человека, а цены и
 * ступени у каждого магазина свои: окно выбора для магазина Б показывало цены
 * магазина А, открытого последним.
 *
 * ── Как проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящие стор входа, сетевой слой с его перехватчиком 401, буфер GPS и
 * экраны. Подменён только сервер: axios отвечает по токену — кто вошёл, тот и
 * автор, как на настоящем сервере; истёкший токен получает 401.
 *
 * Нарочные поломки (каждая роняет проверки ниже):
 *   • flushPendingLocations без фильтра по хозяину — точки А уходят под Б;
 *   • clearUserScopedCaches снова стирает order_draft:* / visit_draft_* —
 *     черновик того же человека пропал;
 *   • stopTrackingOnSignOut снова стирает pending_locations — точки пропали;
 *   • ключ копии каталога без магазина — окно для Б показывает цены А.
 */

const mockRouteParams: Record<string, string> = {};

type Person = { id: number; name: string; role: string };
const A: Person = { id: 7, name: "Агент А", role: "agent" };
const B: Person = { id: 8, name: "Агент Б", role: "agent" };

const TIERS = [{ minQuantity: "1.00", price: "11000.00", priority: 0 }, { minQuantity: "10.00", price: "9000.00", priority: 0 }];
const sugar = (unitPrice: string, tiers: unknown = null) =>
  ({ id: 1, name: "Сахар 1 кг", code: "S1", unitPrice, basePrice: "12000.00", tiers, available: "25.000", unit: "кг" });
/** Каталог по магазину: у первого прайс-лист со ступенями, у второго своя цена, без магазина — карточка. */
const CATALOG: Record<number, unknown[]> = { 0: [sugar("12000.00")], 1: [sugar("11000.00", TIERS)], 2: [sugar("10500.00")] };

/** Сервер понарошку: автор — из токена, истёкший токен — 401, без связи — ответа нет. */
const mockServer = {
  catalog: CATALOG,
  people: { "a@test.local": A, "b@test.local": B } as Record<string, Person>,
  online: true,
  tokens: {} as Record<string, Person>,
  expired: new Set<string>(),
  sent: [] as { procedure: string; userId: number; input: any }[],
  seq: 0,
};

jest.mock("axios", () => {
  const h: { req?: (c: any) => Promise<any>; err?: (e: any) => Promise<any> } = {};
  const call = async (url: string, body?: any) => {
    const cfg = await h.req!({ url, headers: {} });
    const fail = (extra: object) => h.err!(Object.assign(new Error("Network Error"), { config: { url } }, extra));
    if (!mockServer.online) return fail({});
    const token = String(cfg.headers.Authorization ?? "").replace("Bearer ", "");
    const user = mockServer.expired.has(token) ? undefined : mockServer.tokens[token];
    if (!user) return fail({ response: { status: 401, data: {} } });
    const procedure = url.replace(/^\//, "").split("?")[0];
    const query = url.split("?input=")[1];
    const input = body?.json ?? (query ? JSON.parse(decodeURIComponent(query)).json : undefined);
    mockServer.sent.push({ procedure, userId: user.id, input });
    const json = procedure === "auth.me" ? user
      : procedure === "product.listAll" ? mockServer.catalog[input?.shopId ?? 0]
      : procedure.startsWith("agent.") && procedure.endsWith("Shops") ? []
      : null;
    return { status: 200, data: { result: { data: { json } } } };
  };
  const instance = {
    interceptors: {
      request: { use: (fn: any) => { h.req = fn; } },
      response: { use: (_ok: unknown, onError: any) => { h.err = onError; } },
    },
    get: (url: string) => call(url),
    post: (url: string, body: unknown) => call(url, body),
  };
  const stub = {
    create: () => instance,
    isAxiosError: () => true,
    // Вход: новый токен на каждый вход, как у настоящего сервера.
    post: async (_url: string, body: { email: string }) => {
      const user = mockServer.people[body.email];
      const token = `${user.id}-${++mockServer.seq}`;
      mockServer.tokens[token] = user;
      return { data: { success: true, token, user } };
    },
  };
  return { __esModule: true, default: stub, ...stub };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
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
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "test" } } }));
// Сжатие снимка тянет нативный модуль; фото здесь не снимаются.
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn() }));

import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../store/auth";
import { getMe } from "../api";
import { bufferLocation, flushPendingLocations } from "../backgroundLocation";
import { orderDraftSlot, visitDraftSlot, saveUserDraft, loadUserDraft } from "../lib/user-draft";
import { saveOfflineCopy, loadOfflineCopy, SHOP_PRICES_MAX } from "../lib/offline-copy";
import { useCartStore } from "../store/cart";

const signIn = (who: Person) => useAuthStore.getState().login(who === A ? "a@test.local" : "b@test.local", "pw");
/** Токен истёк на сервере — первый же запрос получает 401 и проходит настоящий перехватчик. */
async function expireSession() {
  for (const token of Object.keys(mockServer.tokens)) mockServer.expired.add(token);
  await expect(getMe()).rejects.toBeTruthy();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
}
const pt = (n: number) => ({ lat: 41 + n / 1000, lng: 69.24, accuracy: 10, recordedAt: `2026-09-28T10:00:${String(n).padStart(2, "0")}.000Z` });
const stored = async () => JSON.parse((await AsyncStorage.getItem("pending_locations")) ?? "[]") as { lat: number; ownerId?: number }[];
/** Кто что отправил: [автор по токену, широта]. */
const sentPoints = () => mockServer.sent.filter(s => s.procedure === "agent.saveLocation").map(s => [s.userId, Number(s.input.lat)]);

const ORDER_DRAFT = {
  shop: { id: 1, name: "Магазин у дома" },
  lines: [{ productId: 1, name: "Сахар 1 кг", unitPrice: 11000, quantity: "3", discount: "0", available: 25 }],
  notes: "", paymentMethod: "cash", promisedAt: null,
};
const VISIT_DRAFT = { photos: [], checklist: [{ productId: 1, productName: "Сахар 1 кг", present: true, price: "11500" }], competitorNotes: "" };

beforeEach(async () => {
  await AsyncStorage.clear();
  sessionStorage.clear();
  Object.assign(mockServer, { online: true, tokens: {}, expired: new Set(), sent: [], seq: 0 });
  useAuthStore.setState({ user: null, isAuthenticated: false });
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  useCartStore.setState({ lines: [] });
});

// ── Черновики и точки после 401 ─────────────────────────────────────────────
describe("401 оставляет человеку его работу", () => {
  it("тот же человек входит снова: черновики и точки целы, точки уходят под ним", async () => {
    await signIn(A);
    await bufferLocation(pt(1), pt(2));
    await saveUserDraft(orderDraftSlot(A.id), ORDER_DRAFT);
    await saveUserDraft(visitDraftSlot(A.id, "5"), VISIT_DRAFT);

    await expireSession();
    expect((await stored()).map(p => p.lat)).toEqual([pt(1).lat, pt(2).lat]);

    await signIn(A);
    await flushPendingLocations();

    expect(sentPoints()).toEqual([[A.id, pt(1).lat], [A.id, pt(2).lat]]);
    expect(await stored()).toEqual([]);
    expect((await loadUserDraft<typeof ORDER_DRAFT>(orderDraftSlot(A.id)))?.lines).toEqual(ORDER_DRAFT.lines);
    expect((await loadUserDraft<typeof VISIT_DRAFT>(visitDraftSlot(A.id, "5")))?.checklist).toEqual(VISIT_DRAFT.checklist);
  });

  it("другой человек: не видит и не отправляет, а у хозяина всё лежит до его входа", async () => {
    await signIn(A);
    await bufferLocation(pt(1), pt(2));
    await saveUserDraft(orderDraftSlot(A.id), ORDER_DRAFT);
    await saveUserDraft(visitDraftSlot(A.id, "5"), VISIT_DRAFT);
    await expireSession();

    await signIn(B);
    await bufferLocation(pt(3));
    await flushPendingLocations();

    // Сервер пишет автора из токена: точка А под токеном Б стала бы следом Б.
    expect(sentPoints()).toEqual([[B.id, pt(3).lat]]);
    expect((await stored()).map(p => p.lat)).toEqual([pt(1).lat, pt(2).lat]);
    expect(await loadUserDraft(orderDraftSlot(B.id))).toBeNull();
    expect(await loadUserDraft(visitDraftSlot(B.id, "5"))).toBeNull();
    expect(await loadUserDraft(orderDraftSlot(A.id))).not.toBeNull();

    // Смена кончилась, А вернулся — его точки уходят под ним.
    await useAuthStore.getState().logout();
    await signIn(A);
    await flushPendingLocations();
    expect(sentPoints()).toEqual([[B.id, pt(3).lat], [A.id, pt(1).lat], [A.id, pt(2).lat]]);
    expect(await stored()).toEqual([]);
  });

  it("точки прежней версии, без хозяина, сменщику не уходят", async () => {
    await signIn(A);
    // Прежняя версия писала точки без хозяина и стирала их при конце сессии.
    await AsyncStorage.setItem("pending_locations", JSON.stringify([pt(9)]));
    await expireSession();

    await signIn(B);
    await flushPendingLocations();

    expect(sentPoints()).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it("предел буфера общий на телефон: вытесняются самые старые точки", async () => {
    // 1995 точек А, который давно не входил, и десять свежих у Б.
    const old = Array.from({ length: 1995 }, (_, i) => ({ ...pt(0), lat: i, ownerId: A.id }));
    await AsyncStorage.setItem("pending_locations", JSON.stringify(old));
    await signIn(B);
    await bufferLocation(...Array.from({ length: 10 }, (_, i) => pt(i + 1)));

    const points = await stored();
    expect(points).toHaveLength(2000);
    expect(points[0].lat).toBe(5);
    expect(points.slice(-10).every(p => p.ownerId === B.id)).toBe(true);
  });
});

// ── Экраны: черновик предлагается только автору ─────────────────────────────
describe("экраны предлагают черновик только тому, кто его набрал", () => {
  let alert: jest.SpyInstance;
  beforeEach(() => { alert = jest.spyOn(Alert, "alert").mockImplementation(() => {}); });
  afterEach(() => { alert.mockRestore(); });

  const offered = () => alert.mock.calls.some(c => c[0] === "Продолжить черновик?");
  async function show(Screen: React.ComponentType) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
    // Черновик читается с диска после первого кадра.
    await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
    return view;
  }

  it("новый заказ", async () => {
    const NewOrderScreen = require("../../app/order/new").default;
    await signIn(A);
    await saveUserDraft(orderDraftSlot(A.id), ORDER_DRAFT);
    await expireSession();

    await signIn(B);
    (await show(NewOrderScreen)).unmount();
    expect(offered()).toBe(false);

    await useAuthStore.getState().logout();
    await signIn(A);
    await show(NewOrderScreen);
    expect(offered()).toBe(true);
  }, 15_000);

  it("отчёт о визите", async () => {
    const VisitScreen = require("../../app/merchandiser/visit").default;
    Object.assign(mockRouteParams, { planId: "5", shopId: "1", shopName: "Магазин у дома" });
    await signIn(A);
    await saveUserDraft(visitDraftSlot(A.id, "5"), VISIT_DRAFT);
    await expireSession();

    await signIn(B);
    (await show(VisitScreen)).unmount();
    expect(offered()).toBe(false);

    await useAuthStore.getState().logout();
    await signIn(A);
    await show(VisitScreen);
    expect(offered()).toBe(true);
  }, 15_000);
});

// ── Копия каталога — своего магазина ────────────────────────────────────────
describe("копия каталога без связи — своего магазина", () => {
  it("цены магазина А не подставляются магазину Б", async () => {
    await saveOfflineCopy("products", A.id, CATALOG[1], "shop1");

    const forB = await loadOfflineCopy<any[]>("products", A.id, "shop2");
    // Б со связью не открывали: цена карточки, без ступеней, и экран скажет об этом.
    expect(forB?.data?.[0]).toMatchObject({ unitPrice: "12000.00", tiers: null });
    expect(forB?.cardPrices).toBe(true);

    // Б открыли со связью — общая копия теперь его, а цены А при этом целы.
    await saveOfflineCopy("products", A.id, CATALOG[2], "shop2");
    expect((await loadOfflineCopy<any[]>("products", A.id, "shop2"))?.data?.[0]).toMatchObject({ unitPrice: "10500.00", tiers: null });
    const forA = await loadOfflineCopy<any[]>("products", A.id, "shop1");
    expect(forA?.data?.[0]).toMatchObject({ unitPrice: "11000.00", tiers: TIERS });
    expect(forA?.cardPrices).toBe(false);

    // И чужому человеку ни одна из копий не достаётся.
    expect(await loadOfflineCopy("products", B.id, "shop1")).toBeNull();
  });

  it("магазинов помнится не больше предела, самый давний забывается", async () => {
    for (let shop = 1; shop <= SHOP_PRICES_MAX + 1; shop++) {
      await saveOfflineCopy("products", A.id, CATALOG[1], `shop${shop}`);
    }
    const keys = (await AsyncStorage.getAllKeys()).filter(k => /^offlineCopy\.products\.7\.shop\d+$/.test(k));
    expect(keys).toHaveLength(SHOP_PRICES_MAX);
    expect((await loadOfflineCopy("products", A.id, "shop1"))?.cardPrices).toBe(true);
    expect((await loadOfflineCopy("products", A.id, "shop2"))?.cardPrices).toBe(false);
  });

  it("окно выбора без связи показывает цены своего магазина, а не последнего открытого", async () => {
    const NewOrderScreen = require("../../app/order/new").default;
    await signIn(A);
    const open = (shopId: number) => {
      Object.assign(mockRouteParams, { shopId: String(shopId), shopName: `Магазин ${shopId}` });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);
    };

    // Со связью открыт только первый магазин — его цены и отложены.
    const online = open(1);
    await screen.findByText(/^11 000 сум/);
    await waitFor(async () => expect(await AsyncStorage.getItem("offlineCopy.products.7.shop1")).not.toBeNull());
    online.unmount();

    mockServer.online = false;
    const second = open(2);
    await screen.findByText(/^12 000 сум/);
    expect(screen.queryByText(/^11 000 сум/)).toBeNull();
    expect(screen.getByText(/Цен этого магазина на телефоне нет/)).toBeTruthy();
    second.unmount();

    open(1);
    await screen.findByText(/^11 000 сум/);
    expect(screen.getByText(/Каталог сохранён/)).toBeTruthy();
  }, 15_000);

  it("строки заказа без связи считаются по копии своего магазина, чужие ступени не берут", async () => {
    const NewOrderScreen = require("../../app/order/new").default;
    await signIn(A);
    await saveOfflineCopy("products", A.id, CATALOG[1], "shop1");
    await saveOfflineCopy("shops", A.id, [{ id: 1, name: "Магазин 1", city: "Ташкент" }, { id: 2, name: "Магазин 2", city: "Ташкент" }]);
    mockServer.online = false;
    // Десять штук, набранных заранее по цене unitPrice.
    const fromCart = (shopId: number, unitPrice: number) => {
      useCartStore.setState({ lines: [{ productId: 1, name: "Сахар 1 кг", unitPrice, quantity: "10", discount: "0", available: 25 }] as any });
      Object.assign(mockRouteParams, { fromCart: "1", shopId: String(shopId), shopName: `Магазин ${shopId}` });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(<QueryClientProvider client={client}><NewOrderScreen /></QueryClientProvider>);
    };

    // Первый магазин, строки из корзины по карточке: ступень «от 10 — 9 000» из его копии.
    const first = fromCart(1, 12000);
    expect(await screen.findByText("90 000")).toBeTruthy();

    // Назад и другой магазин: копия первого ещё в памяти экрана, пока читается
    // второй, — и не должна посчитать строки ни на один кадр.
    fireEvent.click(document.querySelector('feather[name="arrow-left"]') as Element);
    fireEvent.click(await screen.findByText("Магазин 2"));
    expect(screen.queryByText("90 000")).toBeNull();
    expect(await screen.findByText("120 000")).toBeTruthy();
    first.unmount();

    // Второго на телефоне нет: строки держат цену, с которой их набрали
    // (10 500 — его цена), — не ступени первого и не карточку.
    fromCart(2, 10500);
    // Копия читается с диска после первого кадра — ждём, пока прочтётся.
    await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
    expect(screen.getByText("105 000")).toBeTruthy();
    expect(screen.queryByText("90 000")).toBeNull();
    expect(screen.queryByText("120 000")).toBeNull();
  }, 15_000);
});
