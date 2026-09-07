/**
 * Кнопка на дне листа не уезжает под системную панель Android.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Владелец дважды присылал один и тот же снимок: лист товара открыт, а кнопка
 * «Добавить в заказ» наполовину лежит на системной панели навигации и не
 * нажимается — палец попадает в «Назад».
 *
 * Первая починка считала отступ через safeBottomPadding, у которого на Android
 * запас 24 точки. Для полоски жестов этого хватает, но у телефонов с ТРЕМЯ
 * кнопками панель 48 — вдвое больше.
 *
 * И это не единственная беда: Modal в React Native — отдельное окно системы, а
 * контекст безопасной зоны рассказывает про окно приложения. На Android оттуда
 * часто приходит ноль, и тогда весь расчёт держится на одном запасе.
 *
 * ── Почему проверка именно такая ────────────────────────────────────────────
 *
 * Цена ошибки несимметрична: лишний отступ — пустая полоса внизу листа,
 * которую никто не заметит; недостающий — кнопка, до которой нельзя
 * дотянуться, и заказ, который не создали. Поэтому проверяется нижняя граница,
 * а не точное число.
 */
import { describe, it, expect, jest } from "@jest/globals";

/** Панель навигации Android из трёх кнопок. */
const ANDROID_NAV_BAR = 48;

describe("отступ внутри модального окна на Android", () => {
  // require, а не import(): динамический import в этом наборе требует
  // экспериментального режима узла, а подменять платформу надо до загрузки темы.
  const load = (): ((b: number, extra?: number) => number) => {
    jest.resetModules();
    jest.doMock("react-native", () => {
      const actual = jest.requireActual("react-native") as { Platform: object };
      return { ...actual, Platform: { ...actual.Platform, OS: "android" } };
    });
    return require("../theme").modalBottomPadding;
  };

  it("нулевой инсет не оставляет кнопку под панелью", async () => {
    // Именно этот случай и происходит внутри Modal: своё окно, чужие инсеты.
    const modalBottomPadding = await load();
    expect(modalBottomPadding(0)).toBeGreaterThanOrEqual(ANDROID_NAV_BAR);
  });

  it("телефон с тремя кнопками получает всю высоту панели", () => {
    const modalBottomPadding = load();
    expect(modalBottomPadding(48)).toBeGreaterThanOrEqual(ANDROID_NAV_BAR);
  });

  it("полоска жестов тоже не меньше панели: запас дешевле недостачи", () => {
    const modalBottomPadding = load();
    expect(modalBottomPadding(16)).toBeGreaterThanOrEqual(ANDROID_NAV_BAR);
  });

  it("большой инсет не урезается", () => {
    const modalBottomPadding = load();
    expect(modalBottomPadding(72)).toBeGreaterThanOrEqual(72);
  });
});

describe("на iOS считается по инсету", () => {
  it("запаса под панель Android там не нужно", () => {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "ios" } }));
    const { modalBottomPadding } = require("../theme");
    expect(modalBottomPadding(34)).toBe(34);
    expect(modalBottomPadding(0)).toBe(0);
  });
});
