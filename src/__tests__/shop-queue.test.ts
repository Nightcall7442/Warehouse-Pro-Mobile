/**
 * Четвёртая очередь: магазин, заведённый без связи, и заказ на него.
 *
 * Раньше без связи экран нового магазина говорил «Нажмите «Создать» ещё
 * раз», а заказ на точку, которой нет на сервере, оформить было нельзя.
 * Здесь: магазин ложится в очередь с временным отрицательным id, сразу
 * виден в выборе магазина, уходит с ключом попытки экрана, а заказы на него
 * получают настоящий id и уходят только после этого — никогда с временным.
 *
 * Хранилище — настоящая подмена из пакета (в памяти, из jest.setup), чтобы
 * проверять и то, что лежит на диске.
 */
jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) },
}));
jest.mock("../api", () => ({
  API_BASE: "https://test.local",
  createShop: jest.fn(),
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
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook } from "@testing-library/react";
import * as FileSystem from "expo-file-system/legacy";
import * as api from "../api";
import { useShopQueue, usePendingShops, orderShopWait, type PendingShop } from "../store/shop-queue";
import { useOfflineStore, resolveShopId, type OfflineOrder } from "../store/offline";
import { useAuthStore } from "../store/auth";

const apiMock = api as unknown as Record<string, jest.Mock>;
const fsMock = FileSystem as unknown as Record<string, jest.Mock>;
const KEY = "0b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d";
const network = () => new Error("Network Error");
/** Отказ сервера по существу: конверт tRPC — повтор ничего не изменит. */
const refused = (message: string) => Object.assign(new Error(message), { trpcMessage: message, serverRejected: true });

function order(shopId: number, id = "o1"): OfflineOrder {
  return {
    id, shopName: "Новая точка", createdAt: new Date().toISOString(), synced: false,
    input: { shopId, items: [{ productId: 7, quantity: 2, unitPrice: 12000 }], idempotencyKey: "1b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" },
  };
}

/** Что сейчас видит выбор магазина в заказе (хук снимается сразу, чтобы не ловить чужие обновления). */
function pendingNow() {
  const { result, unmount } = renderHook(() => usePendingShops());
  const shops = result.current;
  unmount();
  return shops;
}

async function queueShop(extra: Partial<PendingShop["input"]> = {}, photoUri?: string): Promise<PendingShop> {
  expect(await useShopQueue.getState().add({ name: "Новая точка", city: "Хива", idempotencyKey: KEY, ...extra }, photoUri, 10)).toBe(true);
  return useShopQueue.getState().shops[useShopQueue.getState().shops.length - 1];
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useShopQueue.setState({ shops: [], loaded: true, syncing: false });
  useOfflineStore.setState({ orders: [], deliveryActions: [], shopIds: [], loaded: true, syncingOrders: false, syncingActions: false });
  useAuthStore.setState({ user: { id: 10, name: "Агент", role: "agent" } as never });
});

describe("магазин без связи и заказ на него", () => {
  it("создан без связи → виден в выборе → ушёл → id переписан → заказ ушёл с настоящим id", async () => {
    const shop = await queueShop({}, "file:///cache/ImagePicker/cam.jpg");
    expect(shop.localId).toBeLessThan(0);
    expect(shop.ownerId).toBe(10);
    // Снимок — копией в папке приложения: кэш камеры система чистит сама.
    expect(fsMock.copyAsync).toHaveBeenCalledWith({ from: "file:///cache/ImagePicker/cam.jpg", to: shop.photoUri });
    expect(shop.photoUri).toMatch(/^file:\/\/\/doc\//);

    // Сразу в выборе магазина для заказа — с временным id.
    expect(pendingNow()).toEqual([expect.objectContaining({ id: shop.localId, name: "Новая точка", city: "Хива" })]);

    // Заказ на него ждёт: проход заказов его не трогает.
    expect(await useOfflineStore.getState().addOrder(order(shop.localId))).toBe(true);
    expect(await useOfflineStore.getState().syncAll()).toEqual({ synced: 0, failed: 0 });
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    expect(orderShopWait(shop.localId, useShopQueue.getState().shops, true)).toBe("waiting");

    // Связь есть: фото, магазин с ключом экрана, затем id в заказе.
    apiMock.uploadFile.mockResolvedValue("https://s3/shops/1.jpg");
    apiMock.createShop.mockResolvedValue({ id: 501, idempotent: false });
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    expect(apiMock.uploadFile).toHaveBeenCalledWith(`data:${shop.photoUri}`, "shops");
    expect(apiMock.createShop).toHaveBeenCalledWith(expect.objectContaining({ name: "Новая точка", idempotencyKey: KEY, photoUrl: "https://s3/shops/1.jpg" }));
    expect(useOfflineStore.getState().orders[0].input.shopId).toBe(501);
    const onDisk = JSON.parse((await AsyncStorage.getItem("pending_orders"))!);
    expect(onDisk[0].input.shopId).toBe(501);
    // Отправленный магазин покинул очередь и диск, его копия снимка удалена.
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem("pending_shops"))!)).toEqual([]);
    expect(fsMock.deleteAsync).toHaveBeenCalledWith(shop.photoUri, { idempotent: true });

    apiMock.createOrder.mockResolvedValue({ id: 9001, total: 24000 });
    expect(await useOfflineStore.getState().syncAll()).toEqual({ synced: 1, failed: 0 });
    expect(apiMock.createOrder).toHaveBeenCalledWith(expect.objectContaining({ shopId: 501 }));
  });

  it("заказ, оформленный после ухода магазина под старым id, ложится с настоящим — и после перезапуска", async () => {
    // Экран заказа был открыт на новой точке, пока она отправлялась; черновик помнит временный id.
    const shop = await queueShop();
    apiMock.createShop.mockResolvedValue({ id: 502 });
    await useShopQueue.getState().sync();
    useOfflineStore.setState({ shopIds: [] });
    await useOfflineStore.getState().load();
    expect(resolveShopId(shop.localId)).toBe(502);
    await useOfflineStore.getState().addOrder(order(shop.localId));
    expect(useOfflineStore.getState().orders[0].input.shopId).toBe(502);
  });

  it("ответ потерялся — повтор идёт с тем же ключом и не грузит снимок второй раз", async () => {
    await queueShop({}, "file:///cache/cam.jpg");
    apiMock.uploadFile.mockResolvedValue("https://s3/shops/2.jpg");
    // Магазин на сервере создан, но ответ не дошёл.
    apiMock.createShop.mockRejectedValueOnce(network()).mockResolvedValueOnce({ id: 503, idempotent: true });

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 1 });
    const waiting = useShopQueue.getState().shops[0];
    expect(waiting.retryable).toBe(true);
    expect(waiting.input.photoUrl).toBe("https://s3/shops/2.jpg");

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    const keys = apiMock.createShop.mock.calls.map((c: [{ idempotencyKey: string }]) => c[0].idempotencyKey);
    expect(keys).toEqual([KEY, KEY]);
    expect(apiMock.uploadFile).toHaveBeenCalledTimes(1);
    expect(useShopQueue.getState().shops).toEqual([]);
  });

  it("чужой магазин (сменный телефон) и магазин при неизвестном входе не уходят — и заказ на него тоже", async () => {
    const shop = await queueShop();
    useShopQueue.setState({ shops: [{ ...shop, ownerId: 77 }] });
    await useOfflineStore.getState().addOrder({ ...order(shop.localId), ownerId: 77 });

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 0 });
    // Холодный старт: кто вошёл, ещё не известно.
    useAuthStore.setState({ user: null as never });
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 0 });
    expect(apiMock.createShop).not.toHaveBeenCalled();
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    // И в выборе магазина у другого человека его нет.
    useAuthStore.setState({ user: { id: 10, name: "Агент", role: "agent" } as never });
    expect(pendingNow()).toEqual([]);
  });

  it("сервер отказал навсегда — заказ не уходит, виден как заблокированный; «Убрать» уносит и его", async () => {
    const shop = await queueShop();
    await useOfflineStore.getState().addOrder(order(shop.localId));
    apiMock.createShop.mockRejectedValue(refused("Территория не найдена"));

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 1 });
    const failed = useShopQueue.getState().shops[0];
    expect(failed.retryable).toBe(false);
    expect(failed.error).toBe("Территория не найдена");
    // Автопроход отвергнутое не повторяет; заказ стоит, в очереди и на экране.
    await useShopQueue.getState().sync();
    await useOfflineStore.getState().syncAll();
    expect(apiMock.createShop).toHaveBeenCalledTimes(1);
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().orders.map(o => o.input.shopId)).toEqual([shop.localId]);
    expect(orderShopWait(shop.localId, useShopQueue.getState().shops, true)).toBe("blocked");
    // Ручной повтор заказа тоже не отправляет временный id.
    expect(await useOfflineStore.getState().retry("o1")).toBe(false);
    expect(apiMock.createOrder).not.toHaveBeenCalled();
    // Отвергнутый магазин заказу не предлагается.
    expect(pendingNow()).toEqual([]);

    await useShopQueue.getState().remove(shop.localId);
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(useOfflineStore.getState().orders).toEqual([]);
  });

  it("файл снимка пропал — магазин уходит без фото, агент предупреждён", async () => {
    const { preparePhoto } = require("../lib/prepare-photo") as { preparePhoto: jest.Mock };
    preparePhoto.mockRejectedValueOnce(new Error("Could not open file"));
    await queueShop({}, "file:///cache/gone.jpg");
    apiMock.createShop.mockResolvedValue({ id: 504 });
    const { useToastStore } = require("../store/toast") as typeof import("../store/toast");

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    expect(apiMock.uploadFile).not.toHaveBeenCalled();
    expect(apiMock.createShop).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: undefined, idempotencyKey: KEY }));
    expect(useToastStore.getState().toast?.variant).toBe("warning");
  });

  it("очередь заказов ещё не прочитана с диска — переписывание id её не стирает", async () => {
    // Холодный старт: проход магазинов пришёл раньше, чем заказы прочитаны.
    const shop = await queueShop();
    await AsyncStorage.setItem("pending_orders", JSON.stringify([{ ...order(shop.localId), ownerId: 10 }]));
    useOfflineStore.setState({ orders: [], loaded: false });
    apiMock.createShop.mockResolvedValue({ id: 505 });

    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    const onDisk = JSON.parse((await AsyncStorage.getItem("pending_orders"))!);
    expect(onDisk.map((o: OfflineOrder) => [o.id, o.input.shopId])).toEqual([["o1", 505]]);
  });

  it("новый магазин при непрочитанном диске не стирает ждущие; тот же ключ — одна запись", async () => {
    const first = await queueShop({ name: "Первая" });
    // Перезапуск: память пуста, на диске — вчерашний магазин.
    useShopQueue.setState({ shops: [], loaded: false });
    const second = { name: "Вторая", idempotencyKey: "2b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" };
    expect(await useShopQueue.getState().add(second, undefined, 10)).toBe(true);
    // Запись не легла на диск, агент нажал «Создать» ещё раз — та же попытка.
    expect(await useShopQueue.getState().add({ ...second, ownerName: "Бахтиёр" }, undefined, 10)).toBe(true);

    const onDisk: PendingShop[] = JSON.parse((await AsyncStorage.getItem("pending_shops"))!);
    expect(onDisk.map(s => s.input.name)).toEqual(["Первая", "Вторая"]);
    expect(onDisk[0].localId).toBe(first.localId);
    expect(onDisk[1].input.ownerName).toBe("Бахтиёр");
  });

  it("проход заказов шёл, пока магазин уходил, — его итог не возвращает временный id", async () => {
    const shop = await queueShop();
    await useOfflineStore.getState().addOrder(order(shop.localId, "o1"));
    await useOfflineStore.getState().addOrder(order(42, "o2"));
    // Заказ на обычный магазин висит на медленной связи, магазин тем временем уходит.
    let release: (v: unknown) => void = () => {};
    apiMock.createOrder.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const pass = useOfflineStore.getState().syncAll();
    apiMock.createShop.mockResolvedValue({ id: 506 });
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    release({ id: 9002, total: 24000 });
    expect(await pass).toEqual({ synced: 1, failed: 0 });

    expect(useOfflineStore.getState().orders.find(o => o.id === "o1")!.input.shopId).toBe(506);
    const onDisk = JSON.parse((await AsyncStorage.getItem("pending_orders"))!);
    expect(onDisk.map((o: OfflineOrder) => [o.id, o.input.shopId])).toEqual([["o1", 506]]);
  });

  it("пары «временный → настоящий» не копятся без предела", async () => {
    for (let i = 1; i <= 60; i++) await useOfflineStore.getState().remapShopId(-i, 1000 + i);
    const pairs: [number, number][] = JSON.parse((await AsyncStorage.getItem("shop_id_map"))!);
    expect(pairs).toHaveLength(50);
    expect(pairs[pairs.length - 1]).toEqual([-60, 1060]);
    expect(resolveShopId(-60)).toBe(1060);
  });

  it("без хозяина магазин в очередь не ложится; лежащий без хозяина — ничей: не виден и не уходит", async () => {
    // Хозяина не передали (экран не снял его до запроса) — отказ, а не «ничья» запись.
    expect(await useShopQueue.getState().add({ name: "Ничья", idempotencyKey: KEY }, undefined, undefined)).toBe(false);
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(await AsyncStorage.getItem("pending_shops")).toBeNull();

    // Запись без хозяина (так она ложилась после 401) не своя ни для кого —
    // даже для того, кто сейчас вошёл.
    const shop = await queueShop();
    useShopQueue.setState({ shops: [{ ...shop, ownerId: undefined }] });
    expect(pendingNow()).toEqual([]);
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 0 });
    expect(apiMock.createShop).not.toHaveBeenCalled();
  });

  it("403 на создание (истекла подписка) — не отказ навсегда: проход идёт дальше, магазин уходит следующим проходом", async () => {
    await queueShop({ name: "Первая" });
    await queueShop({ name: "Вторая", idempotencyKey: "2b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" });
    await useOfflineStore.getState().addOrder({ ...order(useShopQueue.getState().shops[0].localId), ownerId: 10 });
    // Так приходит 403 от сервера (withSubscriptionGate): статус и конверт tRPC.
    const forbidden = Object.assign(new Error("Подписка истекла"), { response: { status: 403 }, trpcMessage: "Подписка истекла", serverRejected: true });
    apiMock.createShop.mockRejectedValueOnce(forbidden).mockResolvedValueOnce({ id: 507 });

    // Проход на 403 не встаёт: второй магазин уходит.
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 1 });
    expect(apiMock.createShop.mock.calls.map((c: [{ name: string }]) => c[0].name)).toEqual(["Первая", "Вторая"]);
    const [first] = useShopQueue.getState().shops;
    expect(first.input.name).toBe("Первая");
    // Не отвергнут: причина на карточке, заказ на него ждёт, а не «не уйдёт».
    expect(first.retryable).toBe(true);
    expect(first.error).toBe("Подписка истекла");
    expect(orderShopWait(first.localId, useShopQueue.getState().shops, true)).toBe("waiting");
    expect(pendingNow().map(p => p.name)).toEqual(["Первая"]);

    // Подписку продлили — следующий автопроход берёт его сам, без «Повторить».
    apiMock.createShop.mockResolvedValueOnce({ id: 508 });
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 1, failed: 0 });
    expect(apiMock.createShop.mock.calls.map((c: [{ name: string }]) => c[0].name)).toEqual(["Первая", "Вторая", "Первая"]);
    expect(useShopQueue.getState().shops).toEqual([]);
    expect(useOfflineStore.getState().orders[0].input.shopId).toBe(508);
  });

  it("очередь магазинов ещё не прочитана с диска — заказ ждёт, а не «не уйдёт»", () => {
    expect(orderShopWait(-5, [], false)).toBe("waiting");
    expect(orderShopWait(-5, [], true)).toBe("blocked");
    expect(orderShopWait(42, [], false)).toBeNull();
  });

  it("сеть упала на первом — остальные ждут, по порядку создания", async () => {
    await queueShop({ name: "Первая" });
    await queueShop({ name: "Вторая", idempotencyKey: "2b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d" });
    apiMock.createShop.mockRejectedValue(network());
    expect(await useShopQueue.getState().sync()).toEqual({ synced: 0, failed: 1 });
    expect(apiMock.createShop).toHaveBeenCalledTimes(1);
    expect(apiMock.createShop.mock.calls[0][0].name).toBe("Первая");
    expect(useShopQueue.getState().shops.map(s => s.status_)).toEqual(["failed", "pending"]);
  });
});
