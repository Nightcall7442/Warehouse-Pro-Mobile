/**
 * Белая метка: валюта арендатора и его цвет в палитре.
 *
 * Подмена AsyncStorage стоит в jest.setup.js и общая для всего набора —
 * повторять её здесь не нужно. Проверяется то, что ломается молча: знак
 * валюты в суммах и читаемость надписи на фирменной заливке.
 */
import { formatMoney, useBrandingStore } from "../store/branding";
import { useThemeStore } from "../store/theme";
import { readableInk, shade } from "../lib/contrast";

const setCurrency = (currencySymbol: string, symbolPosition: "before" | "after") =>
  useBrandingStore.setState(s => ({ branding: { ...s.branding, currencySymbol, symbolPosition } }));

/** Разделитель разрядов у «ru» — неразрывный пробел, вписывать его руками нельзя. */
const n = (v: number) => v.toLocaleString("ru");

describe("валюта арендатора", () => {
  afterEach(() => setCurrency("сум", "after"));

  it("по умолчанию — знак после суммы", () => {
    expect(formatMoney(1200000)).toBe(`${n(1200000)} сум`);
  });

  it("знак берётся из настроек организации, а не из кода экрана", () => {
    setCurrency("$", "before");
    expect(formatMoney(1500)).toBe(`$ ${n(1500)}`);
  });

  it("строка с суммой из API разбирается так же, как число", () => {
    setCurrency("₸", "after");
    expect(formatMoney("2500.00")).toBe(`${n(2500)} ₸`);
  });

  it("мусор вместо суммы не печатает NaN", () => {
    expect(formatMoney(null)).toBe("0 сум");
    expect(formatMoney("—")).toBe("0 сум");
  });
});

describe("цвет арендатора в палитре", () => {
  afterEach(() => useThemeStore.getState().applyBranding("auto", null));

  it("светлый фирменный цвет получает тёмные чернила", () => {
    useThemeStore.getState().applyBranding("light", "#ffe600");
    const { colors, isDark } = useThemeStore.getState();
    expect(isDark).toBe(false);
    expect(colors.brand.primary).toBe("#ffe600");
    expect(colors.brand.ink).toBe("#1c1a17");
  });

  it("тёмный фирменный цвет оставляет белые чернила", () => {
    useThemeStore.getState().applyBranding("dark", "#1b2a5e");
    expect(useThemeStore.getState().colors.brand.ink).toBe("#ffffff");
  });

  it("выбор пользователя сильнее настройки организации", () => {
    useThemeStore.setState({ userChoice: "dark" });
    useThemeStore.getState().applyBranding("light", null);
    expect(useThemeStore.getState().isDark).toBe(true);
    useThemeStore.setState({ userChoice: null });
  });

  it("мусор вместо цвета не попадает в палитру", () => {
    useThemeStore.getState().applyBranding("dark", "не цвет");
    // Запасной цвет — тот же, что в палитре тёмной темы: коралл.
    expect(useThemeStore.getState().colors.brand.primary).toBe("#f26d6d");
  });

  it("второй край градиента уходит от фона, а не в него", () => {
    // Светлый цвет темнеет, тёмный светлеет — иначе кнопка сливается с карточкой.
    expect(readableInk(shade("#ffe600"))).toBe("#1c1a17");
    expect(shade("#ffe600") < "#ffe600").toBe(true);
    expect(shade("#102040") > "#102040").toBe(true);
  });
});
