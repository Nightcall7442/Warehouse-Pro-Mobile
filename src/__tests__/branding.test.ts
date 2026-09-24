/**
 * Белая метка: валюта арендатора и его цвет в палитре.
 *
 * Подмена AsyncStorage стоит в jest.setup.js и общая для всего набора —
 * повторять её здесь не нужно. Проверяется то, что ломается молча: знак
 * валюты в суммах и читаемость надписи на фирменной заливке.
 */
import { formatMoney, useBrandingStore } from "../store/branding";
import { useThemeStore } from "../store/theme";
import { contrastRatio } from "../lib/contrast";
import { hexToOklch } from "../lib/brand-palette";

const hueDiff = (a: string, b: string) => {
  const d = Math.abs(hexToOklch(a)!.H - hexToOklch(b)!.H) % 360;
  return Math.min(d, 360 - d);
};

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

  it("фирменный цвет садится на тему: тон его, надпись на заливке читается", () => {
    // Жёлтый в светлой теме — не «вырви глаз», а заливка средней светлоты с читаемой надписью.
    useThemeStore.getState().applyBranding("light", "#ffe600");
    const light = useThemeStore.getState();
    expect(light.isDark).toBe(false);
    expect(light.colors.brand.primary).not.toBe("#ffe600");
    expect(hueDiff(light.colors.brand.primary, "#ffe600")).toBeLessThanOrEqual(12);
    expect(contrastRatio(light.colors.brand.primary, light.colors.brand.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.colors.bg.card, light.colors.brand.primary)).toBeGreaterThanOrEqual(3);

    // Тёмно-синий в тёмной теме светлеет до читаемого — не грязь на графите.
    useThemeStore.getState().applyBranding("dark", "#1b2a5e");
    const dark = useThemeStore.getState();
    expect(hueDiff(dark.colors.brand.primary, "#1b2a5e")).toBeLessThanOrEqual(12);
    expect(contrastRatio(dark.colors.bg.card, dark.colors.brand.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.colors.brand.primary, dark.colors.brand.ink)).toBeGreaterThanOrEqual(4.5);
    expect(dark.colors.brand.primaryLight).not.toBe(dark.colors.brand.primary);
  });

  it("латунь продукта в тёмной теме система не портит; серый не розовеет", () => {
    useThemeStore.getState().applyBranding("dark", "#c9a227");
    expect(useThemeStore.getState().colors.brand.primary).toBe("#c9a227");
    useThemeStore.getState().applyBranding("dark", "#808080");
    expect(hexToOklch(useThemeStore.getState().colors.brand.primary)!.C).toBeLessThan(0.01);
  });

  it("выбор пользователя сильнее настройки организации", () => {
    useThemeStore.setState({ userChoice: "dark" });
    useThemeStore.getState().applyBranding("light", null);
    expect(useThemeStore.getState().isDark).toBe(true);
    useThemeStore.setState({ userChoice: null });
  });

  it("мусор вместо цвета не попадает в палитру", () => {
    useThemeStore.getState().applyBranding("dark", "не цвет");
    // Запасной цвет — тот же, что в палитре тёмной темы: золото (v8).
    expect(useThemeStore.getState().colors.brand.primary).toBe("#c9a227");
  });

  it("второй край градиента — шаг светлоты того же тона, а не второй цвет", () => {
    useThemeStore.getState().applyBranding("light", "#2563eb");
    const { brand, gradient } = useThemeStore.getState().colors;
    expect(gradient.primary).toEqual([brand.primary, brand.primaryLight]);
    expect(hueDiff(brand.primary, brand.primaryLight)).toBeLessThanOrEqual(3);
    // В светлой теме наведение темнее, в тёмной — светлее: от фона, не в него.
    expect(hexToOklch(brand.primaryLight)!.L).toBeLessThan(hexToOklch(brand.primary)!.L);
    useThemeStore.getState().applyBranding("dark", "#2563eb");
    const d = useThemeStore.getState().colors.brand;
    expect(hexToOklch(d.primaryLight)!.L).toBeGreaterThan(hexToOklch(d.primary)!.L);
  });
});
