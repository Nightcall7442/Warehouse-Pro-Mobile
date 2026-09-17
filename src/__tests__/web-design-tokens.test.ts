import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { LightColors, DarkColors } from "../theme";
import { CARD } from "../lib/brand-palette";

/**
 * Телефон и веб — один продукт (владелец, 17.09.2026: «не сочетается с
 * вебом»). Светлая тема мобилки стояла на холодном серо-голубом холсте, веб —
 * на тёплой бумаге. Теперь палитра берётся из веб-приложения (src/index.css):
 *
 *   · холст, поверхности, чернила, рамки светлой темы — те же hex, что в вебе;
 *   · тёмная — как была: она и так совпадала;
 *   · карточка бренд-палитры (CARD) — та же, что в веб-модуле brand-palette;
 *   · кнопки — ровным цветом бренда, без градиентов (в вебе neo-btn-primary
 *     ровный); шапка «Показателей» — ровная, как ScreenHeader.
 */
const root = join(__dirname, "..", "..");
const WEB = { surface: "#efedea", raised: "#f2f0ec", light: "#f6f4f0", border: "#d8d5cd", borderSubtle: "#e0ddd7", borderStrong: "#c4c0b8", ink: "#2b2a28", inkSoft: "#5e5b54", inkFaint: "#6b6760", darkSurface: "#221f1c", darkRaised: "#262320", darkInk: "#ede9e3", darkInkSoft: "#a39d92" };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; });
}

describe("палитра — из веба", () => {
  it("светлая: бумага, поверхности, чернила и рамки как в src/index.css веба", () => {
    expect(LightColors.bg.primary).toBe(WEB.surface);
    expect(LightColors.bg.secondary).toBe(WEB.raised);
    expect(LightColors.bg.elevated).toBe(WEB.light);
    expect(LightColors.text.primary).toBe(WEB.ink);
    expect(LightColors.text.secondary).toBe(WEB.inkSoft);
    expect(LightColors.text.tertiary).toBe(WEB.inkFaint);
    expect(LightColors.border.default).toBe(WEB.border);
    expect(LightColors.border.subtle).toBe(WEB.borderSubtle);
    expect(LightColors.border.strong).toBe(WEB.borderStrong);
    expect(CARD.light).toBe(WEB.surface);
  });
  it("тёмная — та же, что в вебе", () => {
    expect(DarkColors.bg.secondary).toBe(WEB.darkSurface);
    expect(DarkColors.bg.elevated).toBe(WEB.darkRaised);
    expect(DarkColors.text.primary).toBe(WEB.darkInk);
    expect(DarkColors.text.secondary).toBe(WEB.darkInkSoft);
    expect(CARD.dark).toBe(WEB.darkSurface);
  });
  it("тени светлой темы — тёплые, цвета холста, а не холодные", () => {
    const theme = readFileSync(join(root, "src", "theme.ts"), "utf8");
    expect(theme).not.toContain("#c3c8d2");
    expect(theme).not.toContain("#e7eaf0");
  });
});

describe("ровные кнопки и шапки — как в вебе", () => {
  it("кнопок с градиентом бренда в экранах нет", () => {
    for (const f of walk(join(root, "app"))) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("<LinearGradient colors={Gradients.primary}")).toBe(false);
    }
  });
  it("шапка «Показателей» ровная: цвета bg.secondary, чернила обычные", () => {
    const src = readFileSync(join(root, "app", "(tabs)", "targets.tsx"), "utf8");
    expect(src).toContain("backgroundColor: colors.bg.secondary, ...soft(isDark).raisedSm");
    expect(src).toContain("const headerInk = colors.text.primary;");
    expect(src).not.toContain("<LinearGradient");
  });
});
