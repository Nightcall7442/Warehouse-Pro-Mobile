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
  /** Все попытки, включая отвергнутые 401 и без связи: «не отправлено» — значит, не было и попытки. */
  tried: [] as string[],
  seq: 0,
  /** Ответы по процедуре, сверх каталога и списков. */
  replies: {} as Record<string, unknown>,
  /** Позвать после принятого запроса — например, «токен истёк сразу после загрузки фото». */
  after: undefined as undefined | ((procedure: string) => void),
  /** Задержать ответ: запрос уже принят под своим токеном, ответ придёт, когда обещание исполнится. */
  gate: undefined as undefined | ((procedure: string) => Promise<void> | undefined),
};

jest.mock("axios", () => {
  const h: { req?: (c: any) => Promise<any>; err?: (e: any) => Promise<any> } = {};
  const call = async (url: string, body?: any) => {
    const cfg = await h.req!({ url, headers: {} });
    const fail = (extra: object) => h.err!(Object.assign(new Error("Network Error"), { config: { url } }, extra));
    const procedure = url.replace(/^\//, "").split("?")[0];
    mockServer.tried.push(procedure);
    if (!mockServer.online) return fail({});
    const token = String(cfg.headers.Authorization ?? "").replace("Bearer ", "");
    const user = mockServer.expired.has(token) ? undefined : mockServer.tokens[token];
    // 401 настоящий сервер отдаёт конвертом tRPC.
    if (!user) return fail({ response: { status: 401, data: { error: { json: { message: "UNAUTHORIZED" } } } } });
    const query = url.split("?input=")[1];
    const input = body?.json ?? (query ? JSON.parse(decodeURIComponent(query)).json : undefined);
    mockServer.sent.push({ procedure, userId: user.id, input });
    mockServer.after?.(procedure);
    await mockServer.gate?.(procedure);
    const json = procedure === "auth.me" ? user
      : procedure in mockServer.replies ? mockServer.replies[procedure]
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
  useFocusEffect: jest.fn(),
}));
// Экран доставок: связь по мнению телефона есть, запрос при этом получает 401.
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })) }));
// Карточки доставок проявляются анимацией; нативной части в jest нет.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: { View }, FadeIn: { duration: () => ({}) } };
});
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
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "test" } } }));
// Сжатие снимка тянет нативный модуль; фото здесь не снимаются.
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn() }));

import React from "react";
import { render, renderHook, screen, waitFor, act, fireEvent } from "@testing-library/react";
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
  Object.assign(mockServer, { online: true, tokens: {}, expired: new Set(), sent: [], tried: [], seq: 0, replies: {}, after: undefined, gate: undefined });
  useAuthStore.setState({ user: null, isAuthenticated: false });
  for (const k of Object.keys(mockRouteParams)) delete mockRouteParams[k];
  useCartStore.setState({ carts: {} });
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

  it("точки прежней версии, без хозяина: после 401 — хозяину профиля, сменщику не уходят", async () => {
    await signIn(A);
    // Прежняя версия писала точки без хозяина и стирала их при конце сессии.
    await AsyncStorage.setItem("pending_locations", JSON.stringify([pt(9)]));
    await expireSession();
    // 401 профиль не стирает: точки сняты в сессии А — они его, а не мусор.
    expect((await stored()).map(p => p.ownerId)).toEqual([A.id]);

    await signIn(B);
    await flushPendingLocations();
    expect(sentPoints()).toEqual([]);

    await useAuthStore.getState().logout();
    await signIn(A);
    await flushPendingLocations();
    expect(sentPoints()).toEqual([[A.id, pt(9).lat]]);
    expect(await stored()).toEqual([]);
  });

  it("точки прежней версии при выходе — вон: хозяина уже не назвать", async () => {
    await signIn(A);
    await AsyncStorage.setItem("pending_locations", JSON.stringify([pt(9)]));
    await useAuthStore.getState().logout();
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
      useCartStore.setState({ carts: { [A.id]: [{ productId: 1, name: "Сахар 1 кг", unitPrice, quantity: "10", discount: "0", available: 25 }] as any } });
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

// ── 401 на само действие: работа — автора ───────────────────────────────────
/*
  Перехватчик 401 (src/api.ts) обнуляет вошедшего раньше, чем экран узнаёт об
  ошибке, а работа ложится в очередь именно оттуда — из onError. Хозяин,
  взятый в этот момент из стора, пуст, и запись без хозяина уходила первым
  проходом под токеном следующего вошедшего. Экраны снимают хозяина ДО
  запроса; очереди без хозяина запись не берут.

  Нарочные поломки (каждая роняет проверки ниже):
    • экран снова берёт хозяина из стора в onError (onMutate/queuedMeta/ownerId
      до запроса убраны) — после 401 запись не ложится или ложится ничьей;
    • add()/addOrder/addDeliveryAction/visit add снова кладут запись без
      хозяина — её видит и отправляет Б;
    • useMyPendingShops и sync снова считают ничей магазин своим.
*/
describe("ответ 401 на само действие: работа остаётся автору и не уходит другому", () => {
  const { useShopQueue } = require("../store/shop-queue") as typeof import("../store/shop-queue");
  const { useOfflineStore } = require("../store/offline") as typeof import("../store/offline");
  const { useVisitQueue } = require("../store/visit-queue") as typeof import("../store/visit-queue");

  /** Токен истёк на сервере, а приложение ещё не знает: 401 придёт на само действие. */
  const expireSilently = () => { for (const token of Object.keys(mockServer.tokens)) mockServer.expired.add(token); };
  const show = (node: React.ReactElement) =>
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
  /** Кто (по токену) отправил эту процедуру. */
  const sentBy = (procedure: string) => mockServer.sent.filter(s => s.procedure === procedure).map(s => s.userId);
  /** Дойти до 401: вошедшего больше нет — ответ прошёл настоящий перехватчик. */
  const afterUnauthorized = () => waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useShopQueue.setState({ shops: [], loaded: true, syncing: false });
    useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false });
    useVisitQueue.setState({ actions: [], loaded: true, syncing: false });
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => { alert.mockRestore(); });

  it("новый магазин: Б его не видит и не отправляет; А после входа — видит и отправляет", async () => {
    const NewShopScreen = require("../../app/shop/new").default;
    const { PendingShops } = require("../components/PendingShops");
    mockServer.replies = { "territory.list": [], "agent.createShop": { id: 901 } };
    await signIn(A);
    const form = show(<NewShopScreen />);
    fireEvent.change(screen.getByPlaceholderText("Продукты 24"), { target: { value: "Лавка у моста" } });
    expireSilently();
    fireEvent.click(screen.getByText("Создать магазин"));
    await afterUnauthorized();
    await waitFor(() => expect(useShopQueue.getState().shops).toHaveLength(1));
    expect(useShopQueue.getState().shops[0].ownerId).toBe(A.id);
    form.unmount();

    await signIn(B);
    const forB = show(<PendingShops />);
    expect(screen.queryByText("Лавка у моста")).toBeNull();
    forB.unmount();
    await useShopQueue.getState().sync();
    expect(sentBy("agent.createShop")).toEqual([]);

    await useAuthStore.getState().logout();
    await signIn(A);
    show(<PendingShops />);
    expect(screen.getByText("Лавка у моста")).toBeTruthy();
    await useShopQueue.getState().sync();
    expect(sentBy("agent.createShop")).toEqual([A.id]);
  }, 15_000);

  it("заказ: Б его не видит и не отправляет; А после входа — видит и отправляет", async () => {
    const NewOrderScreen = require("../../app/order/new").default;
    const OrdersScreen = require("../../app/(tabs)/orders").default;
    mockServer.replies = { "order.create": { id: 5001, total: 33000 }, "order.myOrders": { data: [], total: 0 } };
    await signIn(A);
    useCartStore.setState({ carts: { [A.id]: [{ productId: 1, name: "Сахар 1 кг", unitPrice: 11000, quantity: "3", discount: "0", available: 25 }] as any } });
    Object.assign(mockRouteParams, { fromCart: "1", shopId: "1", shopName: "Магазин у дома" });
    const form = show(<NewOrderScreen />);
    fireEvent.click(await screen.findByText("Продолжить →"));
    expireSilently();
    fireEvent.click(await screen.findByText("Подтвердить заказ"));
    await afterUnauthorized();
    await waitFor(() => expect(useOfflineStore.getState().orders).toHaveLength(1));
    expect(useOfflineStore.getState().orders[0].ownerId).toBe(A.id);
    // Строки корзины ушли в очередь под А — его корзина пуста, хотя вошедшего уже нет.
    expect(useCartStore.getState().carts[A.id]).toBeUndefined();
    form.unmount();

    await signIn(B);
    // Вкладка «Заказы» при открытии сама отправляет очередь — под Б чужое не уходит.
    const forB = show(<OrdersScreen />);
    await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
    expect(screen.queryByText(/не отправлен/)).toBeNull();
    forB.unmount();
    await useOfflineStore.getState().syncAll();
    expect(sentBy("order.create")).toEqual([]);

    await useAuthStore.getState().logout();
    await signIn(A);
    // Без связи вкладка его показывает, а не отправляет сразу.
    mockServer.online = false;
    show(<OrdersScreen />);
    expect(await screen.findByText("1 заказ не отправлен")).toBeTruthy();
    mockServer.online = true;
    await useOfflineStore.getState().syncAll();
    expect(sentBy("order.create")).toEqual([A.id]);
  }, 15_000);

  describe("отметки курьера", () => {
    const delivery = (deliveryStatus: string) => ({ id: 41, orderNumber: "ЗК-41", status: "processing", deliveryStatus, total: "33000", shopName: "Магазин у дома",
      shopAddress: null, shopCity: null, shopGpsLat: null, shopGpsLng: null, createdAt: new Date().toISOString(), deliveredAt: null });
    const courier = { ...A, role: "courier" };
    beforeEach(() => { mockServer.people["a@test.local"] = courier; });
    afterEach(() => { mockServer.people["a@test.local"] = A; });
    const queuedOwner = async () => {
      await afterUnauthorized();
      await waitFor(() => expect(useOfflineStore.getState().deliveryActions).toHaveLength(1));
      return useOfflineStore.getState().deliveryActions[0].ownerId;
    };

    it("«Взять в доставку»: отметка А, Б её не отправляет, А — отправляет", async () => {
      const Deliveries = require("../../app/(tabs)/deliveries").default;
      mockServer.replies = { "courier.listMyDeliveries": [delivery("assigned")], "kpi.courierKpi": null, "courier.markOutForDelivery": null };
      await signIn(A);
      const view = show(<Deliveries />);
      const takeOut = await screen.findByText("Взять в доставку");
      expireSilently();
      fireEvent.click(takeOut);
      expect(await queuedOwner()).toBe(A.id);
      view.unmount();

      await signIn(B);
      await useOfflineStore.getState().syncDeliveryActions();
      expect(sentBy("courier.markOutForDelivery")).toEqual([]);
      await useAuthStore.getState().logout();
      await signIn(A);
      await useOfflineStore.getState().syncDeliveryActions();
      expect(sentBy("courier.markOutForDelivery")).toEqual([A.id]);
    }, 15_000);

    it("«Доставлено» с наличными — отметка А", async () => {
      const Deliveries = require("../../app/(tabs)/deliveries").default;
      mockServer.replies = { "courier.listMyDeliveries": [delivery("out_for_delivery")], "kpi.courierKpi": null };
      alert.mockImplementation((_t, _m, buttons) => { buttons?.[1]?.onPress?.(); });
      await signIn(A);
      show(<Deliveries />);
      const deliver = await screen.findByText("Доставлено");
      expireSilently();
      fireEvent.click(deliver);
      expect(await queuedOwner()).toBe(A.id);
    }, 15_000);

    it("«Не доставлено» с причиной — отметка А", async () => {
      const Deliveries = require("../../app/(tabs)/deliveries").default;
      mockServer.replies = { "courier.listMyDeliveries": [delivery("out_for_delivery")], "kpi.courierKpi": null };
      await signIn(A);
      show(<Deliveries />);
      fireEvent.click(await screen.findByText("Не доставлено"));
      fireEvent.click(await screen.findByText("Магазин закрыт"));
      expireSilently();
      // Последняя «Не доставлено» — кнопка окна причин.
      fireEvent.click(screen.getAllByText("Не доставлено").at(-1)!);
      expect(await queuedOwner()).toBe(A.id);
    }, 15_000);

    it("экран сдачи доставки — отметка А", async () => {
      const DeliveryScreen = require("../../app/order/deliver").default;
      Object.assign(mockRouteParams, { id: "41" });
      mockServer.replies = { "order.getById": { id: 41, orderNumber: "ЗК-41", status: "processing", total: "33000", subtotal: "33000", createdAt: new Date().toISOString(),
        items: [{ id: 1, productId: 1, productName: "Сахар 1 кг", quantity: "3", unitPrice: "11000", subtotal: "33000" }], shop: { id: 1, name: "Магазин у дома" } } };
      alert.mockImplementation((_t, _m, buttons) => { buttons?.[1]?.onPress?.(); });
      await signIn(A);
      show(<DeliveryScreen />);
      const submit = await screen.findByText("ЗАВЕРШИТЬ ДОСТАВКУ");
      expireSilently();
      fireEvent.click(submit);
      expect(await queuedOwner()).toBe(A.id);
    }, 15_000);
  });

  describe("отметки визита", () => {
    const today = new Date().toISOString().slice(0, 10);
    const plan = { id: 5, planDate: today, status: "planned", shopId: 1, shopName: "Магазин у дома", hasOrder: true }; // с заказом: шторка причины — в no-order-reason-*.test
    const queuedOwner = async () => {
      await afterUnauthorized();
      await waitFor(() => expect(useVisitQueue.getState().actions).toHaveLength(1));
      return useVisitQueue.getState().actions[0].ownerId;
    };

    it("вкладка «План», «Готово»: отметка А, Б её не отправляет, А — отправляет", async () => {
      const PlanScreen = require("../../app/(tabs)/plan").default;
      mockServer.replies = { "agent.getPlans": [plan], "agent.updatePlanStatus": null };
      await signIn(A);
      const view = show(<PlanScreen />);
      const done = await screen.findByText("Готово");
      expireSilently();
      fireEvent.click(done);
      expect(await queuedOwner()).toBe(A.id);
      view.unmount();

      await signIn(B);
      await useVisitQueue.getState().sync();
      expect(sentBy("agent.updatePlanStatus")).toEqual([]);
      await useAuthStore.getState().logout();
      await signIn(A);
      await useVisitQueue.getState().sync();
      expect(sentBy("agent.updatePlanStatus")).toEqual([A.id]);
    }, 15_000);

    const agentView = async (press: 1 | 2) => {
      const { AgentPlansView } = require("../components/plans/AgentPlansView");
      // В окне «Подтвердить визит»: 1 — «Без фото», 2 — «С фото».
      alert.mockImplementation((_t, _m, buttons) => { buttons?.[press]?.onPress?.(); });
      await signIn(A);
      show(<AgentPlansView />);
      return screen.findByText("Готово");
    };

    it("маршрут агента, «Без фото» — отметка А", async () => {
      mockServer.replies = { "agent.getPlans": [plan] };
      const done = await agentView(1);
      expireSilently();
      fireEvent.click(done);
      expect(await queuedOwner()).toBe(A.id);
    }, 15_000);

    it("маршрут агента, «С фото», снимок не загрузился — отметка со снимком А", async () => {
      const picker = require("expo-image-picker");
      const { preparePhoto } = require("../lib/prepare-photo");
      picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/visit.jpg" }] });
      preparePhoto.mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,AAAA" });
      mockServer.replies = { "agent.getPlans": [plan] };
      const done = await agentView(2);
      expireSilently();
      fireEvent.click(done);
      expect(await queuedOwner()).toBe(A.id);
      expect(useVisitQueue.getState().actions[0].photoUri).toBe("file:///cache/visit.jpg");
    }, 15_000);

    it("маршрут агента, «С фото», снимок загружен, привязка получила 401 — отметка А", async () => {
      const picker = require("expo-image-picker");
      const { preparePhoto } = require("../lib/prepare-photo");
      picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/visit.jpg" }] });
      preparePhoto.mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,AAAA" });
      mockServer.replies = { "agent.getPlans": [plan], "upload.file": { url: "https://s3/visits/5.jpg" } };
      // Токен истекает сразу после загрузки снимка.
      mockServer.after = p => { if (p === "upload.file") expireSilently(); };
      fireEvent.click(await agentView(2));
      expect(await queuedOwner()).toBe(A.id);
      expect(useVisitQueue.getState().actions[0].photoUrl).toBe("https://s3/visits/5.jpg");
    }, 15_000);
  });

  it("без хозяина ни одна очередь запись не берёт", async () => {
    // Никто не вошёл, хозяина не передали: записать некому — значит, не записываем.
    expect(useAuthStore.getState().user).toBeNull();
    const now = new Date().toISOString();
    expect(await useOfflineStore.getState().addOrder({ id: "o1", shopName: "Магазин у дома", createdAt: now, synced: false,
      input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 11000 }] } })).toBe(false);
    expect(await useOfflineStore.getState().addDeliveryAction({ id: "d1", action: { type: "markOutForDelivery", orderId: 41 }, createdAt: now, synced: false })).toBe(false);
    expect(await useVisitQueue.getState().add({ planId: 5, status: "visited" })).toBe(false);
    expect(useOfflineStore.getState().orders).toEqual([]);
    expect(useOfflineStore.getState().deliveryActions).toEqual([]);
    expect(useVisitQueue.getState().actions).toEqual([]);
    // С хозяином, переданным явно, — берут (так экран кладёт работу после 401).
    expect(await useVisitQueue.getState().add({ planId: 5, status: "visited", ownerId: A.id })).toBe(true);
  });
});

// ── Фоновый GPS на заблокированном iPhone ───────────────────────────────────
describe("хозяин точек GPS читается без SecureStore", () => {
  const task = () => ((require("expo-task-manager").defineTask as jest.Mock).mock.calls.find(c => c[0] === "background-location-task")![1]);
  const fix = { coords: { latitude: 41.5, longitude: 69.24, accuracy: 10 }, timestamp: Date.parse("2026-09-28T10:00:00.000Z") };

  it("связка ключей заперта — точки всё равно копятся под вошедшим; после выхода — ничьи, не копятся", async () => {
    const { SecureStore } = require("../storage");
    await signIn(A);
    mockServer.online = false;
    // Телефон в кармане: SecureStore на iPhone без разблокировки бросает.
    const locked = jest.spyOn(SecureStore, "getItemAsync").mockRejectedValue(new Error("User interaction is not allowed"));
    try {
      await task()({ data: { locations: [fix] }, error: null });
      expect((await stored()).map(p => [p.lat, p.ownerId])).toEqual([[41.5, A.id]]);

      await useAuthStore.getState().logout();
      await task()({ data: { locations: [fix] }, error: null });
      expect(await stored()).toHaveLength(1);
    } finally {
      locked.mockRestore();
    }
  });
});

// ── Копии каталога прежних людей ────────────────────────────────────────────
describe("вход стирает копии каталога прежних людей, но не их работу", () => {
  it("копии А уходят при входе Б; черновик и точки А остаются, своя копия Б — тоже", async () => {
    await signIn(A);
    await saveOfflineCopy("products", A.id, CATALOG[1], "shop1");
    await saveOfflineCopy("shops", A.id, [{ id: 1, name: "Магазин у дома" }]);
    await saveUserDraft(orderDraftSlot(A.id), ORDER_DRAFT);
    await bufferLocation(pt(1));
    await expireSession();

    await signIn(B);
    expect((await AsyncStorage.getAllKeys()).filter(k => k.startsWith("offlineCopy."))).toEqual([]);
    expect(await loadUserDraft(orderDraftSlot(A.id))).not.toBeNull();
    expect((await stored()).map(p => p.ownerId)).toEqual([A.id]);

    await saveOfflineCopy("shops", B.id, [{ id: 2, name: "Магазин Б" }]);
    await useAuthStore.getState().logout();
    await signIn(B);
    expect(await loadOfflineCopy("shops", B.id)).not.toBeNull();
  });
});

// ── Слот черновика фиксируется при открытии экрана ──────────────────────────
describe("смена входа при открытом экране не пишет черновик А под Б", () => {
  const settle = () => act(async () => { await new Promise(r => { setTimeout(r, 2500); }); });

  it("новый заказ", async () => {
    const NewOrderScreen = require("../../app/order/new").default;
    await signIn(A);
    useCartStore.setState({ carts: { [A.id]: [{ productId: 1, name: "Сахар 1 кг", unitPrice: 11000, quantity: "3", discount: "0", available: 25 }] as any } });
    Object.assign(mockRouteParams, { fromCart: "1", shopId: "1", shopName: "Магазин у дома" });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NewOrderScreen /></QueryClientProvider>);
    await screen.findByText("Продолжить →");
    // Экран пережил смену входа (скрытый путь: сейчас AuthGate его размонтирует).
    act(() => { useAuthStore.setState({ user: B as never }); });
    await settle();
    expect(await AsyncStorage.getItem(orderDraftSlot(B.id)!.key)).toBeNull();
    expect((await loadUserDraft<typeof ORDER_DRAFT>(orderDraftSlot(A.id)))?.lines).toHaveLength(1);
  }, 15_000);

  it("отчёт о визите", async () => {
    const VisitScreen = require("../../app/merchandiser/visit").default;
    Object.assign(mockRouteParams, { planId: "5", shopId: "1", shopName: "Магазин у дома" });
    await signIn(A);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VisitScreen /></QueryClientProvider>);
    await screen.findByText("Сахар 1 кг");
    act(() => { useAuthStore.setState({ user: B as never }); });
    await settle();
    expect(await AsyncStorage.getItem(visitDraftSlot(B.id, "5")!.key)).toBeNull();
    expect(await AsyncStorage.getItem(visitDraftSlot(A.id, "5")!.key)).not.toBeNull();
  }, 15_000);
});

// ── Смена входа посреди прохода ─────────────────────────────────────────────
/*
  Токен подставляется в момент каждого запроса, а запрос на слабой связи висит
  до таймаута. Первый запрос прохода уходит под А и висит; А выходит, входит
  Б; ответ приходит — и следующий запрос прохода не должен уйти токеном Б.

  Нарочные поломки (каждая роняет свою проверку ниже): убрать сверку
  вошедшего перед запросом в syncAll, syncDeliveryActions, sync визитов, sync
  магазинов (любую из двух), flushPendingLocations, в цикле фоновой задачи.
*/
describe("смена входа посреди прохода: остаток А не уходит под Б", () => {
  const { useShopQueue } = require("../store/shop-queue") as typeof import("../store/shop-queue");
  const { useOfflineStore } = require("../store/offline") as typeof import("../store/offline");
  const { useVisitQueue } = require("../store/visit-queue") as typeof import("../store/visit-queue");
  const sentBy = (procedure: string) => mockServer.sent.filter(s => s.procedure === procedure).map(s => s.userId);
  const at = (sec: number) => `2026-09-28T10:00:0${sec}.000Z`;

  beforeEach(() => {
    useShopQueue.setState({ shops: [], loaded: true, syncing: false });
    useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false });
    useVisitQueue.setState({ actions: [], loaded: true, syncing: false });
  });

  /** Первый запрос процедуры висит, пока А выходит и входит Б; потом приходит ответ. */
  async function switchMidPass(procedure: string, pass: () => Promise<unknown>) {
    let release: () => void = () => {};
    let first = true;
    mockServer.gate = p => {
      if (p !== procedure || !first) return undefined;
      first = false;
      return new Promise<void>(r => { release = r; });
    };
    const running = pass();
    await waitFor(() => expect(sentBy(procedure)).toHaveLength(1));
    await useAuthStore.getState().logout();
    await signIn(B);
    release();
    await running;
    mockServer.gate = undefined;
    return sentBy(procedure);
  }
  const backAsA = async () => { await useAuthStore.getState().logout(); await signIn(A); };

  it("заказы", async () => {
    await signIn(A);
    for (const id of ["o1", "o2"]) {
      await useOfflineStore.getState().addOrder({ id, shopName: "Магазин у дома", createdAt: at(1), synced: false,
        input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 11000 }] } });
    }
    mockServer.replies = { "order.create": { id: 5001, total: 11000 } };
    expect(await switchMidPass("order.create", () => useOfflineStore.getState().syncAll())).toEqual([A.id]);
    // Второй ждёт хозяина в прежнем виде: не «ошибка», а «ждёт».
    expect(useOfflineStore.getState().orders.filter(o => !o.synced).map(o => [o.id, o.status, o.retryable])).toEqual([["o2", "pending", undefined]]);
    await backAsA();
    await useOfflineStore.getState().syncAll();
    expect(sentBy("order.create")).toEqual([A.id, A.id]);
  });

  it("отметки курьера", async () => {
    await signIn(A);
    await useOfflineStore.getState().addDeliveryAction({ id: "d1", action: { type: "markOutForDelivery", orderId: 41 }, createdAt: at(1), synced: false });
    await useOfflineStore.getState().addDeliveryAction({ id: "d2", action: { type: "markOutForDelivery", orderId: 42 }, createdAt: at(2), synced: false });
    expect(await switchMidPass("courier.markOutForDelivery", () => useOfflineStore.getState().syncDeliveryActions())).toEqual([A.id]);
    expect(useOfflineStore.getState().deliveryActions.filter(a => !a.synced).map(a => [a.id, a.status])).toEqual([["d2", "pending"]]);
    await backAsA();
    await useOfflineStore.getState().syncDeliveryActions();
    expect(sentBy("courier.markOutForDelivery")).toEqual([A.id, A.id]);
  });

  it("визиты", async () => {
    await signIn(A);
    await useVisitQueue.getState().add({ planId: 5, status: "visited" });
    await useVisitQueue.getState().add({ planId: 6, status: "visited" });
    expect(await switchMidPass("agent.updatePlanStatus", () => useVisitQueue.getState().sync())).toEqual([A.id]);
    expect(useVisitQueue.getState().actions.map(a => [a.planId, a.status_])).toEqual([[6, "pending"]]);
  });

  it("визиты со снимком: снимок висел — ни привязка, ни следующие снимки не уходят под Б; ссылка на снимок сохранена", async () => {
    const { preparePhoto } = require("../lib/prepare-photo");
    // Второй снимок на месте, третий пропал из кэша камеры (визит ушёл бы без фото).
    preparePhoto
      .mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,AAAA" })
      .mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,BBBB" })
      .mockRejectedValueOnce(new Error("file not found"));
    mockServer.replies = { "upload.file": { url: "https://s3/visits/5.jpg" } };
    await signIn(A);
    for (const planId of [5, 6, 7]) await useVisitQueue.getState().add({ planId, status: "visited", photoUri: `file:///cache/visit${planId}.jpg` });
    expect(await switchMidPass("upload.file", () => useVisitQueue.getState().sync())).toEqual([A.id]);
    expect(mockServer.tried.filter(p => p === "upload.file")).toHaveLength(1);
    expect(mockServer.tried.filter(p => p === "agent.saveVisitPhoto" || p === "agent.updatePlanStatus")).toEqual([]);
    expect(useVisitQueue.getState().actions.map(a => [a.planId, a.status_, a.ownerId])).toEqual([[5, "pending", A.id], [6, "pending", A.id], [7, "pending", A.id]]);
    // Снимок уже в хранилище — запись помнит ссылку, и повтор не гонит его второй раз.
    expect(useVisitQueue.getState().actions[0].photoUrl).toBe("https://s3/visits/5.jpg");
    await backAsA();
    await useVisitQueue.getState().sync();
    expect(preparePhoto.mock.calls.filter((c: string[]) => c[0] === "file:///cache/visit5.jpg")).toHaveLength(1);
    expect(sentBy("upload.file")).toEqual([A.id]);
    // Визит 5 привязан к тому самому снимку под А. Заглушки снимков 6 и 7 истрачены
    // первым проходом — они уходят без фото, проверка не о них.
    expect(mockServer.sent.filter(s => s.procedure === "agent.saveVisitPhoto").map(s => [s.userId, s.input.planId, s.input.photoUrl]))
      .toEqual([[A.id, 5, "https://s3/visits/5.jpg"]]);
  });

  it("новые магазины: снимок висел — магазин не создаётся под Б, ссылка на снимок сохранена", async () => {
    const { preparePhoto } = require("../lib/prepare-photo");
    preparePhoto.mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,AAAA" });
    mockServer.replies = { "upload.file": { url: "https://s3/shops/1.jpg" }, "agent.createShop": { id: 901 } };
    await signIn(A);
    await useShopQueue.getState().add({ name: "Лавка у моста", idempotencyKey: "k1" }, "file:///cache/shop.jpg", A.id);
    await useShopQueue.getState().add({ name: "Ларёк", idempotencyKey: "k2" }, undefined, A.id);
    expect(await switchMidPass("upload.file", () => useShopQueue.getState().sync())).toEqual([A.id]);
    expect(mockServer.tried.filter(p => p === "agent.createShop")).toEqual([]);
    expect(useShopQueue.getState().shops.map(s => [s.input.name, s.status_, s.input.photoUrl])).toEqual([
      ["Лавка у моста", "pending", "https://s3/shops/1.jpg"], ["Ларёк", "pending", undefined],
    ]);
    await backAsA();
    await useShopQueue.getState().sync();
    expect(sentBy("agent.createShop")).toEqual([A.id, A.id]);
    // Снимок второй раз по слабой связи не гонится.
    expect(sentBy("upload.file")).toEqual([A.id]);
  });

  it("новые магазины: создание висело — следующий не создаётся под Б, и снимок его не грузится", async () => {
    const { preparePhoto } = require("../lib/prepare-photo");
    preparePhoto.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,AAAA" });
    mockServer.replies = { "agent.createShop": { id: 901 }, "upload.file": { url: "https://s3/shops/2.jpg" } };
    try {
      await signIn(A);
      await useShopQueue.getState().add({ name: "Лавка у моста", idempotencyKey: "k1" }, undefined, A.id);
      await useShopQueue.getState().add({ name: "Ларёк", idempotencyKey: "k2" }, "file:///cache/shop2.jpg", A.id);
      expect(await switchMidPass("agent.createShop", () => useShopQueue.getState().sync())).toEqual([A.id]);
      expect(mockServer.tried.filter(p => p === "upload.file")).toEqual([]);
      expect(useShopQueue.getState().shops.map(s => [s.input.name, s.status_])).toEqual([["Ларёк", "pending"]]);
    } finally {
      preparePhoto.mockReset();
    }
  });

  it("точки GPS из буфера", async () => {
    await signIn(A);
    await bufferLocation(pt(1), pt(2));
    let release: () => void = () => {};
    let first = true;
    mockServer.gate = p => { if (p !== "agent.saveLocation" || !first) return undefined; first = false; return new Promise<void>(r => { release = r; }); };
    const flushing = flushPendingLocations();
    await waitFor(() => expect(sentPoints()).toHaveLength(1));
    // Выход ждёт своей очереди к буферу, поэтому ответ приходит, пока выход в пути.
    const out = useAuthStore.getState().logout();
    await waitFor(async () => expect(await AsyncStorage.getItem("gps_owner")).toBeNull());
    release();
    await flushing;
    await out;
    mockServer.gate = undefined;
    await signIn(B);
    await flushPendingLocations();
    expect(sentPoints()).toEqual([[A.id, pt(1).lat]]);
    expect((await stored()).map(p => [p.lat, p.ownerId])).toEqual([[pt(2).lat, A.id]]);
    await backAsA();
    await flushPendingLocations();
    expect(sentPoints()).toEqual([[A.id, pt(1).lat], [A.id, pt(2).lat]]);
  });

  it("пачка точек от системы", async () => {
    const task = (require("expo-task-manager").defineTask as jest.Mock).mock.calls.find(c => c[0] === "background-location-task")![1];
    const fix = (n: number) => ({ coords: { latitude: pt(n).lat, longitude: 69.24, accuracy: 10 }, timestamp: Date.parse(pt(n).recordedAt) });
    await signIn(A);
    expect(await switchMidPass("agent.saveLocation", () => task({ data: { locations: [fix(1), fix(2)] }, error: null }))).toEqual([A.id]);
    // Вторая точка — в буфере под А, а не у сервера под Б.
    expect((await stored()).map(p => [p.lat, p.ownerId])).toEqual([[pt(2).lat, A.id]]);
  });
});

// ── Действие, когда вошедшего уже нет ───────────────────────────────────────
/*
  Отказ очереди «хозяина нет» приходил тем же false, что и переполненный
  диск, и экраны говорили «На телефоне нет места… сообщите в офис». «Выехал
  по всем» после 401 на первой точке давал такое окно на каждую следующую.

  Нарочные поломки (каждая роняет проверки ниже): ownerOrThrow снова отдаёт
  пустого хозяина; любой экран снова берёт хозяина из стора без него; из
  цикла «Выехал по всем» убрана остановка; экран заказа кладёт в очередь без
  проверки isSessionEnded (магазин -5).
*/
describe("действие без вошедшего: не отправляем, не кладём, говорим честно", () => {
  const { useOfflineStore } = require("../store/offline") as typeof import("../store/offline");
  const { useShopQueue } = require("../store/shop-queue") as typeof import("../store/shop-queue");
  const { useToastStore } = require("../store/toast") as typeof import("../store/toast");
  const SESSION = "Сессия закончилась — войдите заново";
  const show = (node: React.ReactElement) =>
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
  const noSpaceText = () => JSON.stringify(alert.mock.calls).includes("нет места");
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false });
    useShopQueue.setState({ shops: [], loaded: true, syncing: false });
    useToastStore.setState({ toast: null });
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => { alert.mockRestore(); mockServer.people["a@test.local"] = A; });

  it("«Выехал по всем» на трёх точках, 401 на первой: одно сообщение, без «нет места»", async () => {
    const Deliveries = require("../../app/(tabs)/deliveries").default;
    const d = (id: number) => ({ id, orderNumber: `ЗК-${id}`, status: "processing", deliveryStatus: "assigned", total: "33000", shopName: `Магазин ${id}`,
      shopAddress: null, shopCity: null, shopGpsLat: null, shopGpsLng: null, createdAt: new Date().toISOString(), deliveredAt: null });
    mockServer.people["a@test.local"] = { ...A, role: "courier" };
    mockServer.replies = { "courier.listMyDeliveries": [d(41), d(42), d(43)], "kpi.courierKpi": null };
    // В окне «Выехал по всем?» сразу «Выехал».
    alert.mockImplementation((title, _m, buttons) => { if (title === "Выехал по всем?") buttons?.[1]?.onPress?.(); });
    await signIn(A);
    show(<Deliveries />);
    const all = await screen.findByText("Выехал по всем (3)");
    for (const token of Object.keys(mockServer.tokens)) mockServer.expired.add(token);
    fireEvent.click(all);

    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe(SESSION));
    // Кроме самого вопроса — ни одного окна: сессия кончилась, сказано тостом.
    expect(alert.mock.calls.filter(c => c[0] !== "Выехал по всем?")).toEqual([]);
    expect(noSpaceText()).toBe(false);
    // Первая точка — в очереди под курьером (уйдёт, когда он войдёт); две другие не пробовали вовсе.
    expect(useOfflineStore.getState().deliveryActions.map(a => [a.action.type === "markOutForDelivery" && a.action.orderId, a.ownerId])).toEqual([[41, A.id]]);
    expect(mockServer.tried.filter(p => p === "courier.markOutForDelivery")).toHaveLength(1);
  }, 15_000);

  // Магазин с сервера и новый, ещё не ушедший (заказ на него идёт прямо в очередь).
  it.each([["1"], ["-5"]])("новый заказ (магазин %s): вошедшего нет в момент нажатия — не отправлен, не в очереди, без «нет места»", async shopId => {
    const NewOrderScreen = require("../../app/order/new").default;
    await signIn(A);
    useCartStore.setState({ carts: { [A.id]: [{ productId: 1, name: "Сахар 1 кг", unitPrice: 11000, quantity: "3", discount: "0", available: 25 }] as any } });
    Object.assign(mockRouteParams, { fromCart: "1", shopId, shopName: "Магазин у дома" });
    show(<NewOrderScreen />);
    fireEvent.click(await screen.findByText("Продолжить →"));
    await screen.findByText("Подтвердить заказ");
    // 401 пришёл на другой запрос — вошедшего уже нет, а экран ещё открыт.
    await expireSession();
    fireEvent.click(await screen.findByText("Подтвердить заказ"));

    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe(SESSION));
    expect(alert).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().orders).toEqual([]);
    expect(mockServer.tried.filter(p => p === "order.create")).toEqual([]);
  }, 15_000);

  it("новый магазин: вошедшего нет в момент нажатия — не отправлен, не в очереди, без «нет места»", async () => {
    const NewShopScreen = require("../../app/shop/new").default;
    mockServer.replies = { "territory.list": [] };
    await signIn(A);
    show(<NewShopScreen />);
    fireEvent.change(screen.getByPlaceholderText("Продукты 24"), { target: { value: "Лавка у моста" } });
    await expireSession();
    fireEvent.click(screen.getByText("Создать магазин"));

    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe(SESSION));
    expect(noSpaceText()).toBe(false);
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(mockServer.tried.filter(p => p === "agent.createShop")).toEqual([]);
  }, 15_000);

  describe("каждый экран с очередью", () => {
    const today = new Date().toISOString().slice(0, 10);
    const plan = { id: 5, planDate: today, status: "planned", shopId: 1, shopName: "Магазин у дома", hasOrder: true }; // с заказом: шторка причины — в no-order-reason-*.test
    const delivery = (deliveryStatus: string) => ({ id: 41, orderNumber: "ЗК-41", status: "processing", deliveryStatus, total: "33000", shopName: "Магазин у дома",
      shopAddress: null, shopCity: null, shopGpsLat: null, shopGpsLng: null, createdAt: new Date().toISOString(), deliveredAt: null });
    const { useVisitQueue } = require("../store/visit-queue") as typeof import("../store/visit-queue");
    beforeEach(() => { useVisitQueue.setState({ actions: [], loaded: true, syncing: false }); });

    /** Экран открыт под А; сессия кончилась другим запросом; нажатие — без вошедшего. */
    async function pressWithoutSession(open: () => Promise<void>, press: () => Promise<void>, procedure: string) {
      await signIn(A);
      await open();
      await expireSession();
      await press();
      await waitFor(() => expect(useToastStore.getState().toast?.message).toMatch(SESSION));
      expect(noSpaceText()).toBe(false);
      expect(mockServer.tried.filter(p => p === procedure)).toEqual([]);
      expect(useOfflineStore.getState().deliveryActions).toEqual([]);
      expect(useVisitQueue.getState().actions).toEqual([]);
    }
    const asCourier = () => { mockServer.people["a@test.local"] = { ...A, role: "courier" }; };
    const confirmWith = (i: number) => alert.mockImplementation((_t, _m, buttons) => { buttons?.[i]?.onPress?.(); });

    it("доставки: «Доставлено»", async () => {
      const Deliveries = require("../../app/(tabs)/deliveries").default;
      asCourier();
      mockServer.replies = { "courier.listMyDeliveries": [delivery("out_for_delivery")], "kpi.courierKpi": null };
      confirmWith(1);
      await pressWithoutSession(async () => { show(<Deliveries />); await screen.findByText("Доставлено"); },
        async () => { fireEvent.click(screen.getByText("Доставлено")); }, "courier.markDelivered");
    }, 15_000);

    it("доставки: «Не доставлено»", async () => {
      const Deliveries = require("../../app/(tabs)/deliveries").default;
      asCourier();
      mockServer.replies = { "courier.listMyDeliveries": [delivery("out_for_delivery")], "kpi.courierKpi": null };
      await pressWithoutSession(async () => {
        show(<Deliveries />);
        fireEvent.click(await screen.findByText("Не доставлено"));
        fireEvent.click(await screen.findByText("Магазин закрыт"));
      }, async () => { fireEvent.click(screen.getAllByText("Не доставлено").at(-1)!); }, "courier.markFailed");
    }, 15_000);

    it("сдача доставки", async () => {
      const DeliveryScreen = require("../../app/order/deliver").default;
      asCourier();
      Object.assign(mockRouteParams, { id: "41" });
      mockServer.replies = { "order.getById": { id: 41, orderNumber: "ЗК-41", status: "processing", total: "33000", subtotal: "33000", createdAt: new Date().toISOString(),
        items: [{ id: 1, productId: 1, productName: "Сахар 1 кг", quantity: "3", unitPrice: "11000", subtotal: "33000" }], shop: { id: 1, name: "Магазин у дома" } } };
      confirmWith(1);
      await pressWithoutSession(async () => { show(<DeliveryScreen />); await screen.findByText("ЗАВЕРШИТЬ ДОСТАВКУ"); },
        async () => { fireEvent.click(screen.getByText("ЗАВЕРШИТЬ ДОСТАВКУ")); }, "courier.completeDelivery");
    }, 15_000);

    it("вкладка «План», «Готово»", async () => {
      const PlanScreen = require("../../app/(tabs)/plan").default;
      mockServer.replies = { "agent.getPlans": [plan] };
      await pressWithoutSession(async () => { show(<PlanScreen />); await screen.findByText("Готово"); },
        async () => { fireEvent.click(screen.getByText("Готово")); }, "agent.updatePlanStatus");
    }, 15_000);

    it("маршрут агента, «Без фото»", async () => {
      const { AgentPlansView } = require("../components/plans/AgentPlansView");
      mockServer.replies = { "agent.getPlans": [plan] };
      confirmWith(1);
      await pressWithoutSession(async () => { show(<AgentPlansView />); await screen.findByText("Готово"); },
        async () => { fireEvent.click(screen.getByText("Готово")); }, "agent.updatePlanStatus");
    }, 15_000);

    it("маршрут агента, «С фото»", async () => {
      const { AgentPlansView } = require("../components/plans/AgentPlansView");
      const picker = require("expo-image-picker");
      picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/visit.jpg" }] });
      mockServer.replies = { "agent.getPlans": [plan] };
      confirmWith(2);
      await pressWithoutSession(async () => { show(<AgentPlansView />); await screen.findByText("Готово"); },
        async () => { fireEvent.click(screen.getByText("Готово")); }, "upload.file");
    }, 15_000);
  });
});

// ── Корзина каталога ────────────────────────────────────────────────────────
/*
  Корзина живёт в памяти процесса и переживала смену входа: Б видел на
  каталоге «В заказе: N товаров → Оформить» с позициями А и оформлял их под
  собой. Нарочная поломка: myCartLines/useMyCartLines отдают строки без
  сверки хозяина — проверки ниже падают.
*/
describe("корзина каталога — того, кто её набрал", () => {
  it("Б не видит и не оформляет корзину А; А после 401 находит её на месте", async () => {
    const { myCartLines, useCartSummary } = require("../store/cart") as typeof import("../store/cart");
    const plaque = () => { const { result, unmount } = renderHook(() => useCartSummary()); const r = result.current; unmount(); return r.count; };
    await signIn(A);
    useCartStore.getState().add({ id: 1, name: "Сахар 1 кг", unitPrice: "11000.00" }, 3);
    expect(plaque()).toBe(1);
    await expireSession();

    await signIn(B);
    expect(plaque()).toBe(0);
    expect(myCartLines()).toEqual([]);
    // Экран заказа из корзины у Б — без строк А.
    const NewOrderScreen = require("../../app/order/new").default;
    Object.assign(mockRouteParams, { fromCart: "1", shopId: "1", shopName: "Магазин у дома" });
    const openFromCart = async () => {
      const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NewOrderScreen /></QueryClientProvider>);
      await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
      // Строка корзины — «3 × 11 000 = 33 000»; сам товар виден и в каталоге экрана.
      const hasLine = screen.queryByText("33 000") !== null;
      view.unmount();
      return hasLine;
    };
    expect(await openFromCart()).toBe(false);

    await useAuthStore.getState().logout();
    await signIn(A);
    expect(plaque()).toBe(1);
    expect(myCartLines().map(l => [l.productId, l.quantity])).toEqual([[1, "3"]]);
    expect(await openFromCart()).toBe(true);
  }, 15_000);

  /*
    Корзина была одна на всех с пометкой хозяина: первое «+» у Б стирало
    корзину А, заказ Б её чистил, а «+» без вошедшего обнулял строки.
    Нарочные поломки: add без сверки вошедшего; add, заменяющий все корзины
    своей; clear, чистящий все корзины, — каждая роняет проверку.
  */
  it("Б набирает и оформляет свою корзину — корзина А цела; без вошедшего «+» ничего не кладёт", async () => {
    const { myCartLines } = require("../store/cart") as typeof import("../store/cart");
    const sugar1 = { id: 1, name: "Сахар 1 кг", unitPrice: "11000.00" };
    const lines = () => myCartLines().map(l => [l.productId, l.quantity]);
    await signIn(A);
    useCartStore.getState().add(sugar1, 3);
    await expireSession();
    // Вошедшего нет — строке лечь некуда, и корзина А не тронута.
    useCartStore.getState().add(sugar1, 5);
    expect(Object.keys(useCartStore.getState().carts)).toEqual([String(A.id)]);

    await signIn(B);
    expect(lines()).toEqual([]);
    useCartStore.getState().add(sugar1, 2);
    expect(lines()).toEqual([[1, "2"]]);
    // Б оформляет свою корзину — чистится его корзина, а не А.
    const NewOrderScreen = require("../../app/order/new").default;
    mockServer.replies = { "order.create": { id: 5002, total: 22000 } };
    Object.assign(mockRouteParams, { fromCart: "1", shopId: "1", shopName: "Магазин у дома" });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NewOrderScreen /></QueryClientProvider>);
    fireEvent.click(await screen.findByText("Продолжить →"));
    fireEvent.click(await screen.findByText("Подтвердить заказ"));
    await waitFor(() => expect(lines()).toEqual([]));
    expect(mockServer.sent.filter(s => s.procedure === "order.create").map(s => [s.userId, s.input.items[0].quantity])).toEqual([[B.id, 2]]);

    await useAuthStore.getState().logout();
    await signIn(A);
    expect(lines()).toEqual([[1, "3"]]);
  }, 15_000);
});

// ── Записи прежней сборки без хозяина ───────────────────────────────────────
/*
  Боевая сборка до правки клала заказ, отметку или визит в очередь без
  хозяина, если 401 успевал обнулить вошедшего, — и такая запись уходила под
  следующим вошедшим. При чтении с диска она получает хозяина по профилю
  телефона (401 профиль не стирает) или помечается ничьей навсегда.

  Нарочные поломки: load() без adoptOwnerless — первая проверка падает
  (запись ничья, А её не отправит); adoptOwnerless без NO_OWNER — вторая
  (следующее чтение отдало бы запись вошедшему потом).
*/
describe("записи прежней сборки без хозяина", () => {
  const { useOfflineStore, NO_OWNER } = require("../store/offline") as typeof import("../store/offline");
  const { useVisitQueue } = require("../store/visit-queue") as typeof import("../store/visit-queue");
  const OLD = "2026-09-27T10:00:00.000Z";
  const putLegacy = () => Promise.all([
    AsyncStorage.setItem("pending_orders", JSON.stringify([{ id: "old-o", shopName: "Магазин у дома", createdAt: OLD, synced: false,
      input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 11000 }] } }])),
    AsyncStorage.setItem("pending_delivery_actions", JSON.stringify([{ id: "old-d", action: { type: "markOutForDelivery", orderId: 41 }, createdAt: OLD, synced: false }])),
    AsyncStorage.setItem("pending_visit_actions", JSON.stringify([{ id: "old-v", planId: 5, status: "visited", createdAt: OLD, synced: false }])),
  ]);
  /** Запуск приложения: очереди читаются с диска. */
  const launch = async () => {
    useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: false, syncingOrders: false, syncingActions: false });
    useVisitQueue.setState({ actions: [], loaded: false, syncing: false });
    await useOfflineStore.getState().load();
    await useVisitQueue.getState().load();
  };
  const pass = async () => {
    await useOfflineStore.getState().syncAll();
    await useOfflineStore.getState().syncDeliveryActions();
    await useVisitQueue.getState().sync();
  };
  const QUEUED = ["order.create", "courier.markOutForDelivery", "agent.updatePlanStatus"];
  const sentQueued = () => mockServer.sent.filter(s => QUEUED.includes(s.procedure)).map(s => [s.procedure, s.userId]);
  const owners = async () => [
    ...JSON.parse((await AsyncStorage.getItem("pending_orders")) ?? "[]"),
    ...JSON.parse((await AsyncStorage.getItem("pending_delivery_actions")) ?? "[]"),
    ...JSON.parse((await AsyncStorage.getItem("pending_visit_actions")) ?? "[]"),
  ].map((e: { ownerId?: number }) => e.ownerId);
  /** Видит ли вошедший на вкладке «Заказы» неотправленный заказ. */
  const ordersTabShowsQueued = async () => {
    const OrdersScreen = require("../../app/(tabs)/orders").default;
    mockServer.online = false;
    const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrdersScreen /></QueryClientProvider>);
    await act(async () => { await new Promise(r => { setTimeout(r, 50); }); });
    const seen = screen.queryByText(/не отправлен/) !== null;
    view.unmount();
    mockServer.online = true;
    return seen;
  };

  it("профиль на телефоне есть — записи его: Б их не видит и не шлёт, А после входа шлёт", async () => {
    mockServer.replies = { "order.create": { id: 5001, total: 11000 }, "order.myOrders": { data: [], total: 0 } };
    await signIn(A);
    // Прежняя сборка: 401, запись легла без хозяина; затем обновление и запуск.
    await expireSession();
    await putLegacy();
    await launch();
    expect(await owners()).toEqual([A.id, A.id, A.id]);

    await signIn(B);
    expect(await ordersTabShowsQueued()).toBe(false);
    await pass();
    expect(sentQueued()).toEqual([]);

    await useAuthStore.getState().logout();
    await signIn(A);
    expect(await ordersTabShowsQueued()).toBe(true);
    await pass();
    expect(sentQueued()).toEqual([["order.create", A.id], ["courier.markOutForDelivery", A.id], ["agent.updatePlanStatus", A.id]]);
  }, 15_000);

  /*
    Профиль не прочитался при запуске (iPhone заперт) — записи остались без
    хозяина до следующего чтения, а к нему профиль уже Б. Их отдают уходящему
    профилю, пока он ещё лежит: при входе другого и при выходе; очередь, ещё
    не прочитанную с диска, сперва читают. Нарочные поломки: writeCachedUser(null)
    без settleOwnerlessWork; settleOwnerless без записи на диск или без чтения
    непрочитанной очереди — записи уходят под Б.
  */
  it.each([["401", "вход другого"], ["logout", "выход"], ["unread", "очередь ещё не прочитана"]])("профиль не прочитался при запуске — ничьё уходит уходящему профилю (%s, %s)", async end => {
    const { SecureStore } = require("../storage");
    mockServer.replies = { "order.create": { id: 5001, total: 11000 }, "order.myOrders": { data: [], total: 0 } };
    await signIn(A);
    if (end !== "logout") await expireSession();
    await putLegacy();
    if (end === "unread") {
      // Холодный старт: очереди ещё не прочитаны, в памяти пусто.
      useOfflineStore.setState({ orders: [], deliveryActions: [], loaded: false });
      useVisitQueue.setState({ actions: [], loaded: false });
    } else {
      const locked = jest.spyOn(SecureStore, "getItemAsync").mockRejectedValue(new Error("User interaction is not allowed"));
      try { await launch(); } finally { locked.mockRestore(); }
    }
    expect(await owners()).toEqual([undefined, undefined, undefined]);

    if (end === "logout") await useAuthStore.getState().logout();
    await signIn(B);
    // Следующий запуск: профиль теперь Б, но записи уже А.
    await launch();
    expect(await owners()).toEqual([A.id, A.id, A.id]);
    expect(await ordersTabShowsQueued()).toBe(false);
    await pass();
    expect(sentQueued()).toEqual([]);

    await useAuthStore.getState().logout();
    await signIn(A);
    await pass();
    expect(sentQueued()).toEqual([["order.create", A.id], ["courier.markOutForDelivery", A.id], ["agent.updatePlanStatus", A.id]]);
  }, 15_000);

  it("профиля нет — записи ничьи навсегда: не видны и не уходят, и следующий запуск не отдаёт их вошедшему", async () => {
    mockServer.replies = { "order.myOrders": { data: [], total: 0 } };
    await putLegacy();
    await launch();
    expect(await owners()).toEqual([NO_OWNER, NO_OWNER, NO_OWNER]);

    await signIn(A);
    expect(await ordersTabShowsQueued()).toBe(false);
    await pass();
    // Профиль теперь А — но ничьё ему не достаётся и при следующем запуске.
    await launch();
    await pass();
    expect(sentQueued()).toEqual([]);
    expect(await owners()).toEqual([NO_OWNER, NO_OWNER, NO_OWNER]);
  }, 15_000);
});

// ── Хозяин точек GPS: переходный путь ───────────────────────────────────────
/*
  gps_owner появился в этой версии. Поставленные раньше телефоны получают его
  при первом запуске без связи (hydrate), а до того хозяин читается из
  профиля в SecureStore. Нарочные поломки: убрать writeCachedUser(cached) из
  офлайн-ветки hydrate; убрать чтение SecureStore из sessionOwner.
*/
describe("хозяин точек GPS до первого входа новой версии", () => {
  it("запуск без связи с профилем прежней версии записывает gps_owner", async () => {
    sessionStorage.setItem("session_token", "7-legacy");
    sessionStorage.setItem("cached_user", JSON.stringify(A));
    mockServer.online = false;
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().user?.id).toBe(A.id);
    expect(await AsyncStorage.getItem("gps_owner")).toBe(String(A.id));
  });

  it("gps_owner ещё нет — точка ложится под хозяина профиля из SecureStore", async () => {
    sessionStorage.setItem("cached_user", JSON.stringify(A));
    expect(await AsyncStorage.getItem("gps_owner")).toBeNull();
    await bufferLocation(pt(1));
    expect((await stored()).map(p => p.ownerId)).toEqual([A.id]);
  });
});

// ── Отметки курьера на переназначенном заказе ───────────────────────────────
/*
  Карточки доставок ключуются номером заказа. Заказ переназначили с курьера А
  на Б — отметка А по нему ложилась на карточку Б, а «Убрать» стирало работу
  А. Нарочные поломки: убрать фильтр своих отметок в deliveries.tsx; убрать
  сверку хозяина в discardDeliveryAction.
*/
describe("заказ переназначили с А на Б", () => {
  const { useOfflineStore } = require("../store/offline") as typeof import("../store/offline");
  afterEach(() => { mockServer.people["b@test.local"] = B; });

  it("отметка А не ложится на карточку Б, и убрать её Б не может", async () => {
    const Deliveries = require("../../app/(tabs)/deliveries").default;
    useOfflineStore.setState({ orders: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false, deliveryActions: [{
      id: "a1", action: { type: "markDelivered", orderId: 41 }, createdAt: new Date().toISOString(), synced: false,
      status: "failed", retryable: false, error: "Заказ не назначен на вас", ownerId: A.id,
    }] });
    mockServer.people["b@test.local"] = { ...B, role: "courier" };
    mockServer.replies = { "courier.listMyDeliveries": [{ id: 41, orderNumber: "ЗК-41", status: "processing", deliveryStatus: "out_for_delivery", total: "33000",
      shopName: "Магазин у дома", shopAddress: null, shopCity: null, shopGpsLat: null, shopGpsLng: null, createdAt: new Date().toISOString(), deliveredAt: null }],
      "kpi.courierKpi": null };
    await signIn(B);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Deliveries /></QueryClientProvider>);
    // Карточка Б — обычная «в пути», с его кнопками; чужой причины отказа на ней нет.
    expect(await screen.findByText("Доставлено")).toBeTruthy();
    expect(screen.queryByText(/Заказ не назначен на вас/)).toBeNull();

    await useOfflineStore.getState().discardDeliveryAction("a1");
    expect(useOfflineStore.getState().deliveryActions.map(a => a.id)).toEqual(["a1"]);
  }, 15_000);
});
