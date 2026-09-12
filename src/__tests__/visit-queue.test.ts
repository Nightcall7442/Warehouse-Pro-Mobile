/**
 * Третья очередь: отметки визитов и фото без связи.
 *
 * Заказы и отметки курьера откладывались и уходили сами; визит — нет: агент
 * в подвале магазина получал «Network Error», и визит оставался
 * неотмеченным. Здесь: отметка ложится в очередь, уходит по одной и по
 * порядку, сетевой отказ останавливает проход, снимок грузится при отправке
 * из файла камеры.
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
  updatePlanStatus: jest.fn(),
  saveVisitPhoto: jest.fn(),
  uploadFile: jest.fn(),
  createOrder: jest.fn(), markOutForDelivery: jest.fn(), markDelivered: jest.fn(), markFailed: jest.fn(), completeDelivery: jest.fn(),
  getMe: jest.fn(), login: jest.fn(), logout: jest.fn(),
}));
jest.mock("../lib/prepare-photo", () => ({ preparePhoto: jest.fn(async (uri: string) => ({ dataUrl: `data:${uri}` })) }));
jest.mock("../backgroundLocation", () => ({
  startBackgroundTracking: jest.fn(async () => ({ success: true })),
  stopBackgroundTracking: jest.fn(async () => {}),
  isBackgroundTrackingActive: jest.fn(async () => false),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "../api";
import { useVisitQueue } from "../store/visit-queue";
import { useAuthStore } from "../store/auth";

const apiMock = api as unknown as Record<string, jest.Mock>;
const storage = AsyncStorage as unknown as Record<string, jest.Mock>;
const at = (sec: number) => new Date(Date.UTC(2026, 8, 12, 10, 0, sec)).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  useVisitQueue.setState({ actions: [], loaded: true, syncing: false });
  useAuthStore.setState({ user: { id: 10, name: "Агент", role: "agent" } as never });
});

describe("очередь визитов", () => {
  it("add пишет на диск и помечает владельца", async () => {
    const ok = await useVisitQueue.getState().add({ planId: 5, status: "visited" });
    expect(ok).toBe(true);
    const a = useVisitQueue.getState().actions[0];
    expect(a.ownerId).toBe(10);
    expect(a.synced).toBe(false);
    const writes = storage.setItem.mock.calls.filter((c: unknown[]) => c[0] === "pending_visit_actions");
    expect(writes).toHaveLength(1);
  });

  it("уходит по порядку createdAt; отправленное покидает очередь", async () => {
    const calls: number[] = [];
    apiMock.updatePlanStatus.mockImplementation(async (planId: number) => { calls.push(planId); });
    useVisitQueue.setState({ actions: [
      { id: "b", planId: 2, status: "visited", createdAt: at(5), synced: false, ownerId: 10 },
      { id: "a", planId: 1, status: "visited", createdAt: at(1), synced: false, ownerId: 10 },
    ] });
    const r = await useVisitQueue.getState().sync();
    expect(calls).toEqual([1, 2]);
    expect(r).toEqual({ synced: 2, failed: 0 });
    expect(useVisitQueue.getState().actions).toEqual([]);
  });

  it("снимок готовится из файла камеры и грузится при отправке", async () => {
    apiMock.uploadFile.mockResolvedValue("https://s3/visits/1.jpg");
    apiMock.saveVisitPhoto.mockResolvedValue(undefined);
    useVisitQueue.setState({ actions: [
      { id: "p", planId: 3, status: "visited", photoUri: "file:///cam/1.jpg", createdAt: at(1), synced: false, ownerId: 10 },
    ] });
    await useVisitQueue.getState().sync();
    expect(apiMock.uploadFile).toHaveBeenCalledWith("data:file:///cam/1.jpg", "visits");
    expect(apiMock.saveVisitPhoto).toHaveBeenCalledWith(3, "https://s3/visits/1.jpg");
    expect(apiMock.updatePlanStatus).not.toHaveBeenCalled();
  });

  it("сеть упала — проход останавливается, запись ждёт; отказ по существу — помечен и не повторяется", async () => {
    apiMock.updatePlanStatus
      .mockRejectedValueOnce(new Error("План не найден"))
      .mockRejectedValueOnce(new Error("Network Error"));
    useVisitQueue.setState({ actions: [
      { id: "a", planId: 1, status: "visited", createdAt: at(1), synced: false, ownerId: 10 },
      { id: "b", planId: 2, status: "visited", createdAt: at(2), synced: false, ownerId: 10 },
      { id: "c", planId: 3, status: "visited", createdAt: at(3), synced: false, ownerId: 10 },
    ] });
    const r = await useVisitQueue.getState().sync();
    expect(r).toEqual({ synced: 0, failed: 2 });
    expect(apiMock.updatePlanStatus).toHaveBeenCalledTimes(2);
    const byId = Object.fromEntries(useVisitQueue.getState().actions.map(a => [a.id, a]));
    expect(byId.a.retryable).toBe(false);
    expect(byId.b.retryable).toBe(true);
    expect(byId.c.status_).toBe("pending");
    // следующий проход: «по существу» не трогается, остальные пробуются
    apiMock.updatePlanStatus.mockResolvedValue(undefined);
    const r2 = await useVisitQueue.getState().sync();
    expect(r2).toEqual({ synced: 2, failed: 0 });
    expect(useVisitQueue.getState().actions.map(a => a.id)).toEqual(["a"]);
  });

  it("чужие записи (сменный телефон) не уходят под моим входом", async () => {
    useVisitQueue.setState({ actions: [
      { id: "x", planId: 9, status: "visited", createdAt: at(1), synced: false, ownerId: 77 },
    ] });
    const r = await useVisitQueue.getState().sync();
    expect(r).toEqual({ synced: 0, failed: 0 });
    expect(apiMock.updatePlanStatus).not.toHaveBeenCalled();
  });
});

describe("экран планов и запуск", () => {
  const fs = require("fs") as typeof import("fs");
  it("без связи отметка и фото уходят в очередь; проход запускается вместе с остальными", () => {
    const view = fs.readFileSync("src/components/plans/AgentPlansView.tsx", "utf-8");
    expect(view).toContain("queueVisit.add({ planId: variables.planId, status: variables.status })");
    expect(view).toContain('queueVisit.add({ planId, status: "visited", photoUri: uri })');
    const layout = fs.readFileSync("app/_layout.tsx", "utf-8");
    expect(layout).toContain("useVisitQueue.getState().sync()");
    expect(layout).toContain("useVisitQueue.getState().load()");
  });
});
