/**
 * Каталог, новый заказ, магазины — три экрана, которыми агент пользуется весь
 * день.
 *
 * Обработчик аппаратной «назад» они получили раньше, а сами остались
 * неразобранными. Здесь стерегутся четыре вещи, найденные при разборе.
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");

describe("каталог", () => {
  const src = read("app/(tabs)/catalog.tsx");


  it("остаток не печатается строкой из базы", () => {
    // Было «1250.000 кг»: DECIMAL приходит строкой, и агент у полки читал
    // владельцу три нуля после запятой.
    expect(src).not.toContain("{product.available} {unitLabel");
    expect(src).toContain("formatQty(product.available)");
  });
});

describe("новый заказ", () => {
  const src = read("app/order/new.tsx");

  it("клавиатура не закрывает поля", () => {
    // На шаге 2 поля «КОЛ-ВО» и «СКИДКА» стоят у нижних позиций, на шаге 3
    // «Примечания» — в самом низу. Без обёртки клавиатура накрывала их
    // вместе с кнопкой «Далее».
    // Проверяется КОРЕНЬ экрана, а не наличие слова в файле: первая версия
    // этой проверки искала подстроку и проходила с вырезанным открывающим
    // тегом — слово оставалось в закрывающем и в импорте.
    const at = src.lastIndexOf("  return (");
    expect(at).toBeGreaterThan(0);
    const rootTag = src.slice(at, at + 700);
    expect(rootTag).toContain("<KeyboardAvoidingView");
    expect(src).toContain("</KeyboardAvoidingView>");
  });

  it("мелкие кнопки окна выбора товара расширены под палец", () => {
    // Крестик 32×32 и голая иконка очистки 16 точек — при норме 44.
    // hitSlop расширяет область отклика, не трогая вид.
    const at = src.indexOf("Выбор товара");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 1800);
    expect((block.match(/hitSlop/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("магазины", () => {
  const src = read("app/(tabs)/shops.tsx");

  it("поиск находит магазины, а не территории", () => {
    // Поиск фильтровал магазины, а на экране оставались карточки территорий:
    // набрал «Dokon Super» → видишь «Ташкент · 1 магазинов» → второй тап.
    // При непустом поиске список плоский.
    expect(src).toContain("(sortByDistance && location) || search.trim() ? (");
  });

  it("аппаратная «назад» возвращает из территории, а не уводит с вкладки", () => {
    // Заход в территорию — смена состояния экрана, а не переход. Система о
    // нём не знает, поэтому «назад» уводила с вкладки целиком, а из первой
    // вкладки закрывала приложение. При этом на экране нарисована своя
    // стрелка «назад» — человек видит её и жмёт привычную системную.
    expect(src).toContain("BackHandler.addEventListener");
    expect(src).toContain("setSelectedTerritory(null)");

    const at = src.indexOf("BackHandler.addEventListener");
    const handler = src.slice(at - 900, at);
    // Окно рабочих зон закрывается раньше, чем снимается территория:
    // оно лежит поверх, и «назад» должна убирать верхнее.
    expect(handler.indexOf("showWorkZones")).toBeLessThan(handler.indexOf("selectedTerritory"));
  });
});
