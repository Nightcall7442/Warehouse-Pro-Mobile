/**
 * Единицы измерения — одни и те же на всех экранах.
 *
 * Таблиц было три, и они разошлись: ящик (box) и блок (block) в карточке
 * заказа звались одним словом, а в каталоге блок печатался кодом из базы.
 * Проверяется здесь ровно то, из-за чего это случилось: что список один и что
 * разные коды дают разные слова.
 */
import { describe, it, expect } from "@jest/globals";
import { UNITS, unitLabel, unitShort, formatQty } from "../lib/units";

/** Коды, которые отдаёт сервер (unit в src/api.ts). */
const SERVER_UNITS = ["kg", "l", "pcs", "box", "pack", "m", "block"];

describe("справочник единиц", () => {
  it("покрывает все коды сервера и ничего лишнего", () => {
    expect(UNITS.map(u => u.value).sort()).toEqual([...SERVER_UNITS].sort());
  });

  it("ящик и блок — разные слова", () => {
    /*
      Ровно та беда, ради которой список сводили в один: в двух таблицах из трёх
      box подписывался «блок» — тем же словом, что и block. Агент, сверяя
      позицию с накладной, различить их не мог.
    */
    expect(unitLabel("box")).toBe("ящик");
    expect(unitLabel("block")).toBe("блок");
    expect(unitShort("box")).not.toBe(unitShort("block"));
  });

  it("у каждого кода своё короткое название", () => {
    const shorts = SERVER_UNITS.map(u => unitShort(u));
    expect(new Set(shorts).size).toBe(SERVER_UNITS.length);
  });
});

describe("подпись рядом с числом", () => {
  it("короткая форма не растягивает строку", () => {
    expect(unitShort("pcs")).toBe("шт");
    expect(unitShort("pack")).toBe("упак");
    // Полные формы — для выпадающих списков.
    expect(unitLabel("pcs")).toBe("штук");
    expect(unitLabel("pack")).toBe("упаковка");
  });

  it("пустая единица — штуки, а не килограммы", () => {
    /*
      В корзине нового заказа запасным значением стояло «кг»: при пустом поле
      цена подписывалась килограммом наугад.
    */
    expect(unitShort(null)).toBe("шт");
    expect(unitShort(undefined)).toBe("шт");
    expect(unitShort("")).toBe("шт");
  });

  it("незнакомый код показывается как есть, а не превращается в килограммы", () => {
    /*
      Сканер подписывал «кг» всё, что не «pcs». Молчаливая подмена хуже
      непонятного кода: по коду видно, что справочник отстал от сервера, а по
      «кг» — ничего.
    */
    expect(unitShort("ton")).toBe("ton");
    expect(unitLabel("ton")).toBe("ton");
  });

  it("узбекские названия на месте", () => {
    expect(unitShort("box", "uz")).toBe("quti");
    expect(unitLabel("block", "uz")).toBe("blok");
  });
});

describe("количество", () => {
  /*
    Разделитель разрядов у русской локали — неразрывный пробел, и он же бывает
    узким. Сравнивать с обычным пробелом напрямую нельзя: проверка развалилась
    бы от версии ICU, а не от ошибки в коде.
  */
  const spaces = (s: string) => s.replace(/\s/g, " ");

  it("копейки штучного товара не показываются", () => {
    // Остаток приходит строкой из decimal(12,2): «150.00» на карточке товара
    // читалось как цена, а не как количество.
    expect(formatQty("150.00")).toBe("150");
    expect(formatQty(150)).toBe("150");
  });

  it("тысячи разбиты на разряды", () => {
    expect(spaces(formatQty("1250.00"))).toBe("1 250");
  });

  it("дробное количество остаётся дробным", () => {
    // У весового товара 1,5 кг — не то же самое, что 1 кг.
    expect(formatQty("1.5")).toBe("1,5");
  });

  it("пустота и мусор — это ноль, а не NaN", () => {
    // NaN рядом с единицей не значит ничего, а место занимает.
    expect(formatQty(null)).toBe("0");
    expect(formatQty(undefined)).toBe("0");
    expect(formatQty("—")).toBe("0");
  });
});
