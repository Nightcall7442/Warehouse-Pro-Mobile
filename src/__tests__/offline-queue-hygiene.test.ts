/**
 * Очереди: диск не растёт, заказы уходят по одному, очередь визитов видна.
 *
 * ── Диск ────────────────────────────────────────────────────────────────────
 * Отправленные записи (полный состав заказа каждая) никто не удалял: строка
 * AsyncStorage росла годами до предела (~2 МБ на Android), после чего
 * читалась как «пусто», а следующая запись затирала все ещё не ушедшие
 * заказы. Теперь на диске только неотправленное.
 *
 * ── Залп ────────────────────────────────────────────────────────────────────
 * Заказы уходили все разом: залп упирался в лимит запросов, часть краснела
 * «Слишком много запросов», автоповтора без флапа сети не было. Теперь по
 * одному; сетевой отказ останавливает проход.
 *
 * ── Видимость ───────────────────────────────────────────────────────────────
 * Очередь визитов не читал ни один экран: отмеченный без связи визит
 * оставался «запланирован» с живыми кнопками, отвергнутая сервером запись
 * висела на диске вечно. Теперь ожидающая запись подменяет статус плана,
 * отвергнутая показана с причиной и «Повторить»/«Убрать».
 */
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
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) },
}));
jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  createOrder: jest.fn(),
  markOutForDelivery: jest.fn(), markDelivered: jest.fn(), markFailed: jest.fn(), completeDelivery: jest.fn(),
  updatePlanStatus: jest.fn(), saveVisitPhoto: jest.fn(), uploadFile: jest.fn(),
  getMe: jest.fn(), login: jest.fn(), logout: jest.fn(),
}));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
  bufferLocation: jest.fn(async () => {}),
  flushPendingLocations: jest.fn(async () => {}),
}));
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: jest.fn() }));
// Нативного модуля картинок в jsdom нет; очередь визитов его тянет через prepare-photo.
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn(async (uri: string) => ({ dataUrl: `data:${uri}` })) }));

import { readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Battery from "expo-battery";
import * as api from "../api";
import { useOfflineStore } from "../store/offline";
import { useVisitQueue } from "../store/visit-queue";
import { useAuthStore } from "../store/auth";
import { useQueuedPlans, isRejected } from "../lib/plan-queue";
import { batteryPercent } from "../lib/battery";
import type { Plan } from "../api";

const apiMock = api as unknown as Record<string, jest.Mock>;
const storage = AsyncStorage as unknown as Record<string, jest.Mock>;
const order = (id: string) => ({ id, input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] }, shopName: id, createdAt: new Date().toISOString(), synced: false, ownerId: 10 });
const lastWrite = (key: string) => JSON.parse(storage.setItem.mock.calls.filter((c: unknown[]) => c[0] === key).at(-1)![1] as string);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 10, name: "Агент", role: "agent" } as never });
  useOfflineStore.setState({ orders: [], deliveryActions: [], loaded: true, syncingOrders: false, syncingActions: false });
  useVisitQueue.setState({ actions: [], loaded: true, syncing: false });
});

describe("диск", () => {
  it("после прохода на диске нет отправленных заказов, в памяти они помечены", async () => {
    apiMock.createOrder.mockResolvedValue({ id: 1, total: 100 });
    useOfflineStore.setState({ orders: [order("a"), order("b")] });
    await useOfflineStore.getState().syncAll();
    expect(useOfflineStore.getState().orders.every(o => o.synced)).toBe(true);
    expect(lastWrite("pending_orders")).toEqual([]);
  });

  it("неотправленное остаётся на диске", async () => {
    apiMock.createOrder.mockRejectedValue(new Error("Network Error"));
    useOfflineStore.setState({ orders: [order("a")] });
    await useOfflineStore.getState().syncAll();
    expect(lastWrite("pending_orders").map((o: { id: string }) => o.id)).toEqual(["a"]);
  });
});

describe("заказы уходят по одному", () => {
  it("второй начинается после первого; после сетевого отказа остальные не пробуются", async () => {
    let inFlight = 0, maxInFlight = 0;
    apiMock.createOrder.mockImplementation(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 2));
      inFlight--;
      return { id: 1, total: 100 };
    });
    useOfflineStore.setState({ orders: [order("a"), order("b"), order("c")] });
    await useOfflineStore.getState().syncAll();
    expect(maxInFlight).toBe(1);
    expect(apiMock.createOrder).toHaveBeenCalledTimes(3);

    apiMock.createOrder.mockReset().mockRejectedValue(new Error("Network Error"));
    useOfflineStore.setState({ orders: [order("d"), order("e"), order("f")] });
    await useOfflineStore.getState().syncAll();
    expect(apiMock.createOrder).toHaveBeenCalledTimes(1);
    // Не дошедшие до отправки ждут, а не считаются отказом по существу.
    expect(useOfflineStore.getState().orders.every(o => o.retryable !== false)).toBe(true);
  });
});

describe("очередь визитов видна", () => {
  const plans: Plan[] = [
    { id: 1, status: "planned", shopName: "А" } as Plan,
    { id: 2, status: "planned", shopName: "Б" } as Plan,
    { id: 3, status: "visited", shopName: "В" } as Plan,
  ];

  it("ожидающая запись подменяет статус; отвергнутая — нет, но видна", () => {
    useVisitQueue.setState({ actions: [
      { id: "p", planId: 1, status: "visited", createdAt: "2026-09-19T10:00:00Z", synced: false, ownerId: 10, status_: "pending" },
      { id: "r", planId: 2, status: "visited", createdAt: "2026-09-19T10:01:00Z", synced: false, ownerId: 10, status_: "failed", retryable: false, error: "План назначен другому" },
    ] });
    const { result } = renderHook(() => useQueuedPlans(plans));
    expect(result.current.plans.map(p => p.status)).toEqual(["visited", "planned", "visited"]);
    expect([...result.current.queued.keys()]).toEqual([1, 2]);
    expect(isRejected(result.current.queued.get(2)!)).toBe(true);
    expect(isRejected(result.current.queued.get(1)!)).toBe(false);
  });

  it("«Повторить» снимает отказ и запускает проход", async () => {
    apiMock.updatePlanStatus.mockResolvedValue(undefined);
    useVisitQueue.setState({ actions: [
      { id: "r", planId: 2, status: "visited", createdAt: "2026-09-19T10:01:00Z", synced: false, ownerId: 10, status_: "failed", retryable: false, error: "x" },
    ] });
    await useVisitQueue.getState().retry("r");
    await new Promise(r => setTimeout(r, 0));
    expect(apiMock.updatePlanStatus).toHaveBeenCalledWith(2, "visited");
    expect(useVisitQueue.getState().actions).toEqual([]);
  });

  it("оба экрана планов и баннер читают очередь", () => {
    for (const f of ["src/components/plans/AgentPlansView.tsx", "app/(tabs)/plan.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("useQueuedPlans(serverPlans)");
      expect(src).toContain("<QueueNote action={queued.get(plan.id)!}");
    }
    expect(readFileSync("src/components/OfflineBanner.tsx", "utf8")).toContain("useVisitQueue(s => s.actions.filter(a => !a.synced && a.retryable !== false).length)");
  });
});

describe("проход синхронизации", () => {
  it("повторяется, если связь вернулась во время прохода; запускается при возврате из фона", () => {
    const layout = readFileSync("app/_layout.tsx", "utf8");
    expect(layout).toContain("if (syncing.current) { rerun.current = true; return; }");
    expect(layout).toContain("if (rerun.current) { rerun.current = false; runSyncRef.current(); }");
    expect(layout).toContain('if (s === "active") runSync();');
  });
});

describe("заряд", () => {
  it("«недоступен» (−1) — не −100 %, а ничего", async () => {
    (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(-1);
    expect(await batteryPercent()).toBeUndefined();
    (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.73);
    expect(await batteryPercent()).toBe(73);
    (Battery.getBatteryLevelAsync as jest.Mock).mockRejectedValue(new Error("no battery module"));
    expect(await batteryPercent()).toBeUndefined();
  });

  it("все три места читают заряд через одну дверь", () => {
    for (const f of ["src/backgroundLocation.ts", "src/lib/visit-ping.ts", "app/(tabs)/gps.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("batteryPercent()");
      expect(src).not.toContain("getBatteryLevelAsync");
    }
  });
});

describe("экран GPS не трогает задачу до восстановления флага", () => {
  it("stop и запись флага — только после чтения с диска", () => {
    const src = readFileSync("app/(tabs)/gps.tsx", "utf8");
    expect(src).toContain("if (hydrated.current) stopBackgroundTracking();");
    expect(src).toContain("if (hydrated.current) AsyncStorage.setItem(AUTO_TRACK_KEY, String(autoTrack));");
  });
});
