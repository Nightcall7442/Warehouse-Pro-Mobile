/**
 * Буфер точек GPS: один на все потоки, объявлен в точке входа, выливается не
 * только фоновой задачей.
 *
 * Буфер трогают четверо: фоновая задача на каждую точку от системы, ручная
 * точка с экрана, точка при отметке визита и проход синхронизации при возврате
 * связи. Два одновременных «прочитать → отправить → записать остаток» теряли
 * точки: последний писатель затирал то, что дописал первый, — дыра в маршруте,
 * которую нечем восстановить.
 *
 * Сама задача объявлялась там, где её включают, — на вкладке «GPS». Когда
 * система будит убитое приложение ради накопленных точек, она поднимает бандл
 * и ищет задачу по имени; вкладка при этом не открывается, задача «не найдена»,
 * точки выброшены.
 */
jest.mock("../api", () => ({ saveLocation: jest.fn() }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import * as api from "../api";
import { readFileSync } from "node:fs";
import { bufferLocation, flushPendingLocations } from "../backgroundLocation";

const save = api.saveLocation as jest.Mock;
const pt = (n: number) => ({ lat: 41 + n / 1000, lng: 69.24, accuracy: 10, recordedAt: `2026-09-19T10:00:${String(n).padStart(2, "0")}.000Z` });
const stored = async () => (JSON.parse((await AsyncStorage.getItem("pending_locations")) ?? "[]") as { lat: number }[]).map(p => p.lat);
const tick = () => new Promise<void>(r => { setTimeout(r, 1); });

beforeEach(async () => {
  save.mockReset();
  await AsyncStorage.clear();
});

describe("буфер точек", () => {
  it("одновременные записи не затирают друг друга", async () => {
    await Promise.all([bufferLocation(pt(1)), bufferLocation(pt(2)), bufferLocation(pt(3))]);
    expect(await stored()).toEqual([pt(1).lat, pt(2).lat, pt(3).lat]);
  });

  it("точка, снятая во время выливания, не теряется", async () => {
    await bufferLocation(pt(1), pt(2));
    // Сервер отвечает медленно; пока первая точка в пути, приходит третья.
    let release!: () => void;
    save.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    save.mockResolvedValue(undefined);
    const flushing = flushPendingLocations();
    while (save.mock.calls.length === 0) await tick();
    const adding = bufferLocation(pt(3));
    release();
    await Promise.all([flushing, adding]);
    // Первые две ушли; третья ждёт следующего прохода, а не стёрта остатком.
    expect(save).toHaveBeenCalledTimes(2);
    expect(await stored()).toEqual([pt(3).lat]);
  });

  it("время съёмки уходит вместе с точкой", async () => {
    save.mockResolvedValue(undefined);
    await bufferLocation(pt(7));
    await flushPendingLocations();
    expect(save).toHaveBeenCalledWith(pt(7).lat, 69.24, 10, undefined, pt(7).recordedAt, undefined);
  });
});

describe("фоновая задача", () => {
  it("объявлена при загрузке модуля, а модуль подключён в точке входа", () => {
    expect(TaskManager.defineTask).toHaveBeenCalledWith("background-location-task", expect.any(Function));
    const layout = readFileSync("app/_layout.tsx", "utf8");
    expect(layout).toContain('from "../src/backgroundLocation"');
  });
});
