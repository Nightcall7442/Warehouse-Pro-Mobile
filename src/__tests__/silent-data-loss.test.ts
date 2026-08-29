import { readFileSync } from "fs";
import { join } from "path";

/**
 * Два места, где данные портились молча.
 *
 * Обе находки объединяет одно: приложение не сообщало ни о чём. Ни ошибки, ни
 * подсветки, ни записи в журнале — человек узнавал о потере позже и в другом
 * месте, где связать её с причиной уже нельзя.
 */

const root = join(__dirname, "..", "..");

describe("Дробное количество в правке заказа", () => {
  const src = readFileSync(join(root, "src", "components", "order", "OrderEditModal.tsx"), "utf8");

  test("количество не разбирается через parseInt", () => {
    /**
     * parseInt("12.5") === 12. Любая правка заказа молча округляла дробный
     * вес вниз, «плюс» давал 13, «минус» 11. Сервер дробное принимает, а
     * экран оформления даже приводит запятую к точке: создать 12.5 кг можно,
     * а открыть и сохранить тот же заказ — нельзя без потери.
     */
    const lines = src.split("\n").filter(l => /parseInt\s*\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    if (lines.length > 0) {
      throw new Error("parseInt вернулся в правку количества:\n  " + lines.map(l => l.trim()).join("\n  "));
    }
  });

  test("поле хранит набранный текст, а не только число", () => {
    // Без этого дробь не набрать в принципе: поле показывало String(число),
    // и «12.» превращалось в NaN ещё до того, как наберут цифру после точки.
    expect(src).toContain("qtyText");
    expect(src).toMatch(/value=\{item\.qtyText\}/);
    // Запятая с русской раскладки приводится к точке.
    expect(src).toMatch(/replace\(",", "\."\)/);
  });

  test("клавиатура позволяет ввести точку", () => {
    expect(src).toMatch(/keyboardType="decimal-pad"/);
  });
});

describe("Ручная отправка точки GPS", () => {
  const src = readFileSync(join(root, "app", "(tabs)", "gps.tsx"), "utf8");

  test("снятая точка не пропадает при обрыве связи", () => {
    /**
     * Точка отправлялась напрямую, и при обрыве связи исчезала совсем — хотя
     * рядом лежит буфер, сделанный для фоновых точек ровно на этот случай.
     * Дыру в маршруте потом нечем восстановить.
     */
    expect(src).toContain("bufferLocation");
  });

  test("в отказе не винят GPS, когда координаты уже получены", () => {
    // Один catch накрывал и получение координат, и отправку, а текст всегда
    // был про GPS. Агент шёл чинить спутник, когда сломана сеть.
    const gpsBlame = src.indexOf("Проверьте, включён ли GPS");
    const netBlame = src.indexOf("не отправлена — нет связи");
    expect(gpsBlame).toBeGreaterThan(-1);
    expect(netBlame).toBeGreaterThan(-1);
    // Сообщение про сеть идёт после — оно в ветке отправки, а не съёмки.
    expect(netBlame).toBeGreaterThan(gpsBlame);
  });
});

describe("Быстрый заказ из каталога", () => {
  const src = readFileSync(join(root, "app", "(tabs)", "catalog.tsx"), "utf8");

  test("не пропадает без связи", () => {
    /**
     * Здесь показывалось только сообщение с текстом ошибки, и заказ пропадал:
     * ни на сервере, ни в очереди. Обман усиливался тем, что этот же экран
     * офлайн рисует полосу «Офлайн данные» и оставляет кнопки живыми.
     */
    expect(src).toContain("isRetryableError");
    expect(src).toContain("addOrder");
    // Прежнее признание в коде — «this quick-add flow has no offline queue» —
    // больше не должно быть правдой.
    expect(src).not.toContain("this quick-add flow has no offline queue");
  });
});
