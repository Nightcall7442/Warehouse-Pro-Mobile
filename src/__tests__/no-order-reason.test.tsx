/**
 * «Почему без заказа?» — причина при закрытии визита на телефоне агента.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Агент жал «Готово», визит закрывался — и всё. Директор видел двадцать
 * визитов и восемь заказов, но не знал, что за остальными двенадцатью. Веб
 * (#155) уже спрашивает причину, а ручки принимают её необязательной — и
 * телефон, на котором агенты отмечают почти все визиты, её не слал вовсе.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 *  1. Шторка: «Закрыть визит» заперта без причины; «Другое» без текста тоже
 *     заперто; выбор уходит наружу (у «Другое» — с текстом без пробелов по
 *     краям); узбекский экран — по-узбекски.
 *  2. Ворота: заказ по hasOrder сервера или ЗАКАЗ В ОЧЕРЕДИ ТЕЛЕФОНА (свой,
 *     не отвергнутый, сегодняшний, этому магазину) — шторки нет. Чужой,
 *     вчерашний, отвергнутый, другому магазину — шторка есть. Мерчандайзера
 *     не касается.
 *  3. Маршрут агента (AgentPlansView): «Без фото» → причина уходит в
 *     updatePlanStatus; «С фото» → причина спрошена ДО камеры и уходит в
 *     saveVisitPhoto; заказ есть — шторки нет, причины в запросе нет.
 *     «Оформить заказ» ведёт в новый заказ этому магазину, визит не закрыт.
 *  4. Вкладка «План»: «Готово» → шторка → updatePlanStatus с причиной.
 *  5. Без связи: отметка с причиной ложится в существующую очередь визитов
 *     и доходит до сервера ОДИН раз и С причиной — и после сорвавшегося
 *     повтора; снимок из очереди — тоже с причиной.
 *
 * Нарочные поломки (каждая роняет проверки ниже):
 *   • visitHasOrder без очереди (только plan.hasOrder) — падает 2;
 *   • «Закрыть визит» без запора (disabled и проверки готовности) — падает 1;
 *   • вкладка «План» отмечает визит мимо ворот — падает 4;
 *   • noOrderInputError не проверяет текст «Другое» — падает 1;
 *   • очередь визитов не передаёт a.noOrder в отправку — падает 5;
 *   • AgentPlansView кладёт в очередь без noOrder — падает 5.
 */

const mockPush = jest.fn();
const mockServer = { online: true, received: [] as { fn: string; args: unknown[] }[] };

jest.mock("../api", () => {
  const net = (fn: string) => jest.fn(async (...args: unknown[]) => {
    if (!mockServer.online) throw new Error("Network Error");
    mockServer.received.push({ fn, args });
  });
  return {
    API_BASE: "https://test.local",
    getPlans: jest.fn(async () => []),
    updatePlanStatus: net("updatePlanStatus"),
    saveVisitPhoto: net("saveVisitPhoto"),
    uploadFile: jest.fn(async () => "https://s3/visits/1.jpg"),
    getOptimizedRoute: jest.fn(),
    getMyQuota: jest.fn(async () => null),
    getAgentKpi: jest.fn(async () => null),
    getMySalary: jest.fn(async () => null),
  };
});
jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) },
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  router: { back: jest.fn(), push: mockPush },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///cam/1.jpg" }] })),
}));
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn(async (uri: string) => ({ dataUrl: `data:${uri}` })) }));
jest.mock("../lib/visit-ping", () => ({ sendVisitPing: jest.fn(async () => {}) }));

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";
import * as api from "../api";
import { useAuthStore } from "../store/auth";
import { useOfflineStore, type OfflineOrder } from "../store/offline";
import { useVisitQueue } from "../store/visit-queue";
import { useLangStore } from "../i18n";
import { NoOrderReasonSheet } from "../components/plans/NoOrderReasonSheet";
import { visitHasOrder } from "../lib/no-order-gate";
import { AgentPlansView } from "../components/plans/AgentPlansView";

const apiMock = api as unknown as Record<string, jest.Mock>;
const AGENT = { id: 10, name: "Агент", role: "agent" };
const NOW = new Date(2026, 9, 2, 12, 0, 0);
const plan = (extra: object = {}) => ({ id: 5, planDate: "2026-10-02", status: "planned", shopId: 7, shopName: "Хумо Маркет", ...extra });
const order = (extra: Partial<OfflineOrder> = {}): OfflineOrder => ({
  id: "o1", input: { shopId: 7, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] }, shopName: "Хумо Маркет",
  createdAt: new Date(2026, 9, 2, 10, 30).toISOString(), synced: false, status: "pending", ownerId: AGENT.id, ...extra,
});

function show(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** В окне «Подтвердить визит»: 1 — «Без фото», 2 — «С фото». */
function answerConfirm(press: 1 | 2) {
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.[press]?.onPress?.(); });
}

const sent = (fn: string) => mockServer.received.filter(r => r.fn === fn).map(r => r.args);

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockServer.online = true;
  mockServer.received = [];
  useLangStore.setState({ lang: "ru", chosen: false });
  useAuthStore.setState({ user: { ...AGENT } as never });
  useOfflineStore.setState({ orders: [], deliveryActions: [], loaded: true } as never);
  useVisitQueue.setState({ actions: [], loaded: true, syncing: false });
});

describe("1. шторка «Почему без заказа?»", () => {
  const open = () => {
    const onConfirm = jest.fn();
    render(<NoOrderReasonSheet shopName="Хумо Маркет" onCancel={jest.fn()} onConfirm={onConfirm} onOrder={jest.fn()} />);
    return onConfirm;
  };

  it("шесть причин; без выбора «Закрыть визит» заперта и молчит", () => {
    const onConfirm = open();
    for (const label of ["Закрыто", "Нет денег", "Есть остаток", "Берёт у конкурента", "Нет хозяина / ответственного", "Другое"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Выберите причину — без неё визит не закрыть")).toBeTruthy();
    fireEvent.click(screen.getByText("Закрыть визит"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("no-order-confirm").getAttribute("aria-disabled")).toBe("true");
  });

  it("причина выбрана — визит закрывается с ней, без текста", () => {
    const onConfirm = open();
    fireEvent.click(screen.getByText("Нет денег"));
    fireEvent.click(screen.getByText("Закрыть визит"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ noOrderReason: "no_money" });
  });

  it("«Другое» без текста заперто; с текстом — уходит текст без пробелов по краям", () => {
    const onConfirm = open();
    fireEvent.click(screen.getByText("Другое"));
    expect(screen.getByText("Для «Другое» напишите коротко, что случилось")).toBeTruthy();
    fireEvent.click(screen.getByText("Закрыть визит"));
    fireEvent.change(screen.getByTestId("no-order-note"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Закрыть визит"));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("no-order-note"), { target: { value: "  ремонт  " } });
    fireEvent.click(screen.getByText("Закрыть визит"));
    expect(onConfirm).toHaveBeenCalledWith({ noOrderReason: "other", noOrderNote: "ремонт" });
  });

  it("текст длиннее 200 знаков — заперто с подсказкой", () => {
    const onConfirm = open();
    fireEvent.click(screen.getByText("Другое"));
    fireEvent.change(screen.getByTestId("no-order-note"), { target: { value: "а".repeat(201) } });
    expect(screen.getByText("Не длиннее 200 знаков")).toBeTruthy();
    fireEvent.click(screen.getByText("Закрыть визит"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("узбекский экран — по-узбекски", () => {
    useLangStore.setState({ lang: "uz" });
    open();
    expect(screen.getByText("Nega buyurtmasiz?")).toBeTruthy();
    expect(screen.getByText("Pul yo'q")).toBeTruthy();
    expect(screen.getByText("Tashrifni yopish")).toBeTruthy();
    expect(screen.getByText("Buyurtma berish")).toBeTruthy();
  });
});

describe("2. ворота: есть ли у визита заказ", () => {
  it("сервер сказал hasOrder — заказ есть", () => {
    expect(visitHasOrder(plan({ hasOrder: true }), [], AGENT.id, NOW)).toBe(true);
    expect(visitHasOrder(plan({ hasOrder: false }), [], AGENT.id, NOW)).toBe(false);
  });

  it("свой сегодняшний заказ этому магазину ждёт связи — заказ есть", () => {
    expect(visitHasOrder(plan(), [order()], AGENT.id, NOW)).toBe(true);
  });

  it("чужой, вчерашний, отвергнутый, отправленный или другому магазину — не заказ этого визита", () => {
    const yesterday = new Date(2026, 9, 1, 18, 0).toISOString();
    for (const o of [
      order({ ownerId: 11 }),
      order({ createdAt: yesterday }),
      order({ status: "failed", retryable: false }),
      order({ synced: true }),
      order({ input: { shopId: 8, items: [] } }),
    ]) {
      expect(visitHasOrder(plan(), [o], AGENT.id, NOW)).toBe(false);
    }
  });
});

describe("3. маршрут агента: причина уходит вместе с отметкой", () => {
  async function openRoute(plans: object[]) {
    apiMock.getPlans.mockResolvedValue(plans);
    show(<AgentPlansView />);
    return screen.findByText("Готово");
  }

  it("«Без фото», заказа нет — шторка; причина уходит в updatePlanStatus", async () => {
    answerConfirm(1);
    fireEvent.click(await openRoute([plan()]));
    expect(await screen.findByText("Почему без заказа?")).toBeTruthy();
    expect(sent("updatePlanStatus")).toEqual([]);
    fireEvent.click(screen.getByText("Есть остаток"));
    fireEvent.click(screen.getByText("Закрыть визит"));
    await waitFor(() => expect(sent("updatePlanStatus")).toEqual([[5, "visited", undefined, { noOrderReason: "has_stock" }]]));
    expect(screen.queryByText("Почему без заказа?")).toBeNull();
  });

  it("«С фото», заказа нет — причина спрошена до камеры и уходит в saveVisitPhoto", async () => {
    const picker = require("expo-image-picker");
    answerConfirm(2);
    fireEvent.click(await openRoute([plan()]));
    await screen.findByText("Почему без заказа?");
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Закрыто"));
    fireEvent.click(screen.getByText("Закрыть визит"));
    await waitFor(() => expect(sent("saveVisitPhoto")).toEqual([[5, "https://s3/visits/1.jpg", undefined, undefined, { noOrderReason: "closed" }]]));
    expect(sent("updatePlanStatus")).toEqual([]);
  });

  it("заказ есть (hasOrder) — шторки нет, причины в запросе нет", async () => {
    answerConfirm(1);
    fireEvent.click(await openRoute([plan({ hasOrder: true })]));
    await waitFor(() => expect(sent("updatePlanStatus")).toEqual([[5, "visited", undefined, undefined]]));
    expect(screen.queryByText("Почему без заказа?")).toBeNull();
  });

  it("заказ ждёт связи в очереди телефона — шторки нет", async () => {
    useOfflineStore.setState({ orders: [order({ createdAt: new Date().toISOString() })] } as never);
    answerConfirm(1);
    fireEvent.click(await openRoute([plan()]));
    await waitFor(() => expect(sent("updatePlanStatus")).toHaveLength(1));
    expect(screen.queryByText("Почему без заказа?")).toBeNull();
  });

  it("«Оформить заказ» — в новый заказ этому магазину, визит не закрыт", async () => {
    answerConfirm(1);
    fireEvent.click(await openRoute([plan()]));
    fireEvent.click(await screen.findByText("Оформить заказ"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/order/new", params: { shopId: "7", shopName: "Хумо Маркет" } });
    expect(screen.queryByText("Почему без заказа?")).toBeNull();
    expect(sent("updatePlanStatus")).toEqual([]);
  });

  it("мерчандайзера не касается: «Готово» ведёт в отчёт, шторки нет", async () => {
    useAuthStore.setState({ user: { id: 12, name: "Мерч", role: "merchandiser" } as never });
    fireEvent.click(await openRoute([plan()]));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/merchandiser/visit" }));
    expect(screen.queryByText("Почему без заказа?")).toBeNull();
  });
});

describe("4. вкладка «План»: «Готово» спрашивает причину", () => {
  it("заказа нет — шторка; причина уходит в updatePlanStatus", async () => {
    const PlanScreen = require("../../app/(tabs)/plan").default;
    apiMock.getPlans.mockResolvedValue([plan()]);
    show(<PlanScreen />);
    fireEvent.click(await screen.findByText("Готово"));
    await screen.findByText("Почему без заказа?");
    fireEvent.click(screen.getByText("Берёт у конкурента"));
    fireEvent.click(screen.getByText("Закрыть визит"));
    await waitFor(() => expect(sent("updatePlanStatus")).toEqual([[5, "visited", undefined, { noOrderReason: "competitor" }]]));
  }, 15_000);
});

describe("5. без связи: причина едет в очереди визитов и доходит один раз", () => {
  it("«Без фото» без связи — в очередь с причиной; сорвавшийся повтор не теряет; дошла один раз", async () => {
    mockServer.online = false;
    answerConfirm(1);
    apiMock.getPlans.mockResolvedValue([plan()]);
    show(<AgentPlansView />);
    fireEvent.click(await screen.findByText("Готово"));
    fireEvent.click(await screen.findByText("Другое"));
    fireEvent.change(screen.getByTestId("no-order-note"), { target: { value: "ремонт" } });
    fireEvent.click(screen.getByText("Закрыть визит"));

    await waitFor(() => expect(useVisitQueue.getState().actions).toHaveLength(1));
    const queued = useVisitQueue.getState().actions[0];
    expect(queued).toMatchObject({ planId: 5, status: "visited", ownerId: AGENT.id, noOrder: { noOrderReason: "other", noOrderNote: "ремонт" } });

    // Связи всё ещё нет: проход сорвался — запись с причиной на месте.
    await act(async () => { await useVisitQueue.getState().sync(); });
    expect(useVisitQueue.getState().actions).toHaveLength(1);
    expect(useVisitQueue.getState().actions[0].noOrder).toEqual({ noOrderReason: "other", noOrderNote: "ремонт" });

    mockServer.online = true;
    await act(async () => { await useVisitQueue.getState().sync(); });
    await act(async () => { await useVisitQueue.getState().sync(); });
    expect(sent("updatePlanStatus")).toEqual([[5, "visited", queued.createdAt, { noOrderReason: "other", noOrderNote: "ремонт" }]]);
    expect(useVisitQueue.getState().actions).toEqual([]);
  });

  it("«С фото» без связи — снимок и причина в очереди, уходят одним запросом", async () => {
    mockServer.online = false;
    apiMock.uploadFile.mockRejectedValueOnce(new Error("Network Error"));
    answerConfirm(2);
    apiMock.getPlans.mockResolvedValue([plan()]);
    show(<AgentPlansView />);
    fireEvent.click(await screen.findByText("Готово"));
    fireEvent.click(await screen.findByText("Нет хозяина / ответственного"));
    fireEvent.click(screen.getByText("Закрыть визит"));
    await waitFor(() => expect(useVisitQueue.getState().actions).toHaveLength(1));
    expect(useVisitQueue.getState().actions[0]).toMatchObject({ photoUri: "file:///cam/1.jpg", noOrder: { noOrderReason: "no_owner" } });

    mockServer.online = true;
    await act(async () => { await useVisitQueue.getState().sync(); });
    expect(sent("saveVisitPhoto")).toEqual([[5, "https://s3/visits/1.jpg", undefined, expect.any(String), { noOrderReason: "no_owner" }]]);
    expect(sent("updatePlanStatus")).toEqual([]);
  });
});
