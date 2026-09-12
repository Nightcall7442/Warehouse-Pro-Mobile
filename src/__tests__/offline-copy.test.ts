/**
 * Без связи есть из чего собрать заказ.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Очередь неотправленных заказов в приложении написана и работает. Вот только
 * СОЗДАТЬ заказ без связи было нельзя: список магазинов приходит запросом, а
 * запрос без связи не приходит — первый шаг мастера показывал пустоту. Кэш
 * react-query живёт только в памяти и умирает вместе с выгрузкой приложения.
 *
 * Получалось приложение, которое умеет работать офлайн и не даёт начать.
 *
 * Отдельно проверяется привязка к человеку: телефон в поле бывает общим на
 * бригаду, и список магазинов одного агента — не список другого.
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveOfflineCopy, loadOfflineCopy, forgetOfflineCopies } from "../lib/offline-copy";

beforeEach(async () => { await AsyncStorage.clear(); });

describe("отложенная копия", () => {
  it("сохранённое читается обратно", async () => {
    await saveOfflineCopy("shops", 7, [{ id: 1, name: "Магазин у дома" }]);
    const found = await loadOfflineCopy<{ id: number; name: string }[]>("shops", 7);
    expect(found?.data).toEqual([{ id: 1, name: "Магазин у дома" }]);
  });

  it("копия помечена временем", async () => {
    // Экран обязан сказать, что данные могли устареть: по остаткам и ценам
    // агент разговаривает с хозяином магазина.
    await saveOfflineCopy("products", 7, [{ id: 1 }]);
    const found = await loadOfflineCopy("products", 7);
    expect(found?.savedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(found!.savedAt))).toBe(false);
  });

  it("чужая копия не подставляется", async () => {
    await saveOfflineCopy("shops", 7, [{ id: 1, name: "Мой магазин" }]);
    expect(await loadOfflineCopy("shops", 8)).toBeNull();
  });

  it("разные виды не путаются", async () => {
    await saveOfflineCopy("shops", 7, ["магазины"]);
    await saveOfflineCopy("products", 7, ["товары"]);
    expect((await loadOfflineCopy<string[]>("shops", 7))?.data).toEqual(["магазины"]);
    expect((await loadOfflineCopy<string[]>("products", 7))?.data).toEqual(["товары"]);
  });

  it("испорченная запись не роняет экран", async () => {
    // Хранилище переживает обновления приложения, и старая запись может быть
    // какой угодно. Экран должен вести себя так, будто её просто нет.
    await AsyncStorage.setItem("offlineCopy.shops.7", "{это не json");
    expect(await loadOfflineCopy("shops", 7)).toBeNull();
  });

  it("пустое хранилище — просто ничего", async () => {
    expect(await loadOfflineCopy("shops", 7)).toBeNull();
  });

  it("копии можно забыть", async () => {
    await saveOfflineCopy("shops", 7, ["a"]);
    await saveOfflineCopy("products", 7, ["b"]);
    await forgetOfflineCopies(7);
    expect(await loadOfflineCopy("shops", 7)).toBeNull();
    expect(await loadOfflineCopy("products", 7)).toBeNull();
  });
});

/*
  Провод из мастера заказа. Хук был написан и покрыт тестом выше, но ни один
  экран его не импортировал: при слиянии ветвей 07.09 подключение из
  app/order/new.tsx потерялось, и утром без связи агент снова видел
  «Ничего не найдено». Здесь закреплено, что оба пикера читают копию и
  говорят о её возрасте.
*/
describe("мастер заказа читает копию", () => {
  const src = require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../../app/order/new.tsx"), "utf-8") as string;

  it("оба пикера подключены к useOfflineCopy", () => {
    expect(src).toContain('useOfflineCopy<typeof liveShops>("shops", liveShops)');
    expect(src).toContain('useOfflineCopy<typeof liveProducts>("products", liveProducts)');
  });

  it("о возрасте копии сказано прямо в обоих", () => {
    expect((src.match(/copyNotice && \(/g) ?? []).length).toBe(2);
    expect(src).toMatch(/Список сохранён/);
    expect(src).toMatch(/Каталог сохранён/);
  });

  it("скелет не перекрывает готовую копию", () => {
    expect((src.match(/const isLoading = liveLoading && !(shops|products);/g) ?? []).length).toBe(2);
  });
});
