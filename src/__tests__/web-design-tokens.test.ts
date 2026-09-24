import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { LightColors, DarkColors } from "../theme";
import { CARD } from "../lib/brand-palette";

/**
 * Палитра v8 (владелец, 24.09.2026, «C и D»).
 *
 *   · тёмная тема — ровно тёмная тема веба (src/index.css): холст, поверхности,
 *     чернила, рамки, золото;
 *   · светлая — вариант C: прохладный холст, БЕЛАЯ карточка, бирюза знака,
 *     жёлтое главное действие; с вебом её роднит шрифт и сдержанность, а не hex;
 *   · карточка бренд-палитры (CARD) — та, на которой лежит цвет арендатора;
 *   · кнопки — ровным цветом, без градиентов.
 */
const root = join(__dirname, "..", "..");
const WEB_DARK = { canvas: "#1c1a17", surface: "#221f1c", raised: "#2a2622", border: "#322e28", ink: "#ede9e3", inkSoft: "#a39d92", inkFaint: "#948e81", gold: "#c9a227" };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; });
}

describe("палитра v8", () => {
  it("тёмная — та же, что в вебе, золото вместо коралла", () => {
    expect(DarkColors.bg.primary).toBe(WEB_DARK.canvas);
    expect(DarkColors.bg.card).toBe(WEB_DARK.surface);
    expect(DarkColors.bg.elevated).toBe(WEB_DARK.raised);
    expect(DarkColors.border.default).toBe(WEB_DARK.border);
    expect(DarkColors.text.primary).toBe(WEB_DARK.ink);
    expect(DarkColors.text.secondary).toBe(WEB_DARK.inkSoft);
    expect(DarkColors.text.tertiary).toBe(WEB_DARK.inkFaint);
    expect(DarkColors.brand.primary).toBe(WEB_DARK.gold);
    expect(CARD.dark).toBe(WEB_DARK.surface);
  });

  it("светлая — вариант C: белая карточка светлее холста, бирюза знака, жёлтое главное действие", () => {
    expect(LightColors.bg.primary).toBe("#f1f4f3");
    expect(LightColors.bg.card).toBe("#ffffff");
    expect(LightColors.brand.primary).toBe("#0e4f49");
    expect(LightColors.brand.cta).toBe("#f5c518");
    expect(LightColors.hero.bg).toBe(LightColors.brand.primary);
    expect(CARD.light).toBe(LightColors.bg.card);
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
