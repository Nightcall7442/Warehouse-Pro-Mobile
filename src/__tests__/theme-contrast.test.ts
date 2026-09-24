// Warehouse Pro — Theme contrast tests
import { DarkColors, LightColors } from "../theme";
import { readableInk } from "../lib/contrast";

describe("Theme Contrast", () => {
  // Helper to calculate relative luminance
  function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const adjust = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
  }

  function contrastRatio(hex1: string, hex2: string): number {
    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  it("dark mode text has sufficient contrast on background", () => {
    const ratio = contrastRatio(DarkColors.text.primary, DarkColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA
  });

  it("light mode text has sufficient contrast on background", () => {
    const ratio = contrastRatio(LightColors.text.primary, LightColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /*
    Надпись на заливке бренда — brand.ink, а не белый: на золоте тёмной темы
    белый даёт ~2:1, поэтому чернила там тёмные. Главное действие (cta) и
    плашка цифры (hero) — со своими чернилами. Всё — не ниже 4.5:1.
  */
  it("надписи на заливках бренда, главного действия и плашки цифры читаются в обеих темах", () => {
    for (const p of [DarkColors, LightColors]) {
      expect(contrastRatio(p.brand.ink, p.brand.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.brand.ctaInk, p.brand.cta)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.hero.ink, p.hero.bg)).toBeGreaterThanOrEqual(4.5);
      // Акцент надписью — на холсте и на карточке.
      expect(contrastRatio(p.accent.primary, p.bg.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accent.primary, p.bg.card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("белый по золоту не читается — потому чернила тёмной темы тёмные", () => {
    expect(contrastRatio("#ffffff", DarkColors.brand.primary)).toBeLessThan(3);
    expect(DarkColors.brand.ink).not.toBe("#ffffff");
  });

  it("dark mode secondary text is readable", () => {
    const ratio = contrastRatio(DarkColors.text.secondary, DarkColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("light mode secondary text is readable", () => {
    const ratio = contrastRatio(LightColors.text.secondary, LightColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  // Надписи на цветных кнопках.
  //
  // Раньше они были прописаны белым литералом. У «Опасно» заливка —
  // status.dangerDim, прозрачный красный в 10%: в светлой теме сквозь него видна
  // почти белая карточка, и надпись давала контраст около 1.1:1 — то есть
  // пропадала. У «Готово» заливка яркая-зелёная, там выходило около 2:1.
  //
  // Проверяется не цвет, а порог: если кто-то снова впишет "#fff", тест упадёт.
  describe("надписи на цветных кнопках", () => {
    it("«Опасно»: чернила читаются на карточке, сквозь которую светит тинт", () => {
      for (const palette of [DarkColors, LightColors]) {
        expect(contrastRatio(readableInk(palette.bg.card), palette.bg.card)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("«Готово»: чернила читаются на зелёной заливке", () => {
      for (const palette of [DarkColors, LightColors]) {
        expect(contrastRatio(readableInk(palette.accent.success), palette.accent.success)).toBeGreaterThanOrEqual(3.0);
      }
    });

    it("белый на этих заливках как раз и не проходит — иначе проверка ничего не стоит", () => {
      expect(contrastRatio("#ffffff", LightColors.bg.card)).toBeLessThan(4.5);
      expect(contrastRatio("#ffffff", LightColors.accent.success)).toBeLessThan(3.0);
      expect(contrastRatio("#ffffff", DarkColors.accent.success)).toBeLessThan(3.0);
    });
  });
});
