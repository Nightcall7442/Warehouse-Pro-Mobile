import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { DarkColors, LightColors, paletteFor, setBrandPrimary } from "../theme";

/**
 * Язык оформления v8 — выбор владельца 24.09.2026: «C и D».
 *
 * Светлая тема — «Финтех» (бирюза знака, белые карточки, жёлтое главное
 * действие, плашка главной цифры), тёмная — «Полевой» (тёмная веба, золото,
 * линии вместо теней). Макеты — артефакт «Мобилка: новые варианты».
 *
 * Стражи здесь — против возврата того, из-за чего мобилка читалась дешёвой:
 * неоновый коралл и фиолетовые переливы, белые надписи на золоте (2:1),
 * тень у букв, КАПС-подписи в 10–11 пунктов на главных плитках.
 *
 * Нарочная поломка: верни в OrderEditModal `color: activeTab === "items" ? "#fff"`
 * — падает «на заливке бренда нет белых надписей».
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (f === "__tests__" || f === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const SCREENS = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src", "components"))];

describe("палитра v8", () => {
  it("ни коралла, ни фиолетового, ни кислотного зелёного в теме", () => {
    // Комментарии не в счёт: в шапке темы старые цвета названы, чтобы было ясно, что ушло.
    const theme = read("src/theme.ts").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    for (const old of ["#f26d6d", "#ff8b87", "#e0554f", "#d64a45", "#a78bfa", "#8e7cf0", "#00e68a", "#ff4d6a"]) {
      expect(theme.includes(old)).toBe(false);
    }
  });

  it("заливки ровные: у градиентов палитры оба края одного цвета", () => {
    for (const p of [DarkColors, LightColors]) {
      for (const [name, pair] of Object.entries(p.gradient)) {
        if (name === "primarySoft") continue; // полупрозрачная подложка: разная только прозрачность
        expect([name, pair[0]]).toEqual([name, pair[1]]);
      }
    }
  });

  it("цвет арендатора ведёт главное действие и плашку цифры (в светлой), тёмная плашка — карточка", () => {
    setBrandPrimary("#2563eb");
    try {
      const light = paletteFor(false), dark = paletteFor(true);
      expect(light.brand.cta).toBe(light.brand.primary);
      expect(light.hero.bg).toBe(light.brand.primary);
      expect(dark.brand.cta).toBe(dark.brand.primary);
      expect(dark.hero).toEqual(DarkColors.hero);
    } finally {
      setBrandPrimary(null);
    }
  });
});

describe("экраны v8", () => {
  /*
    Та же разметка, что у разбора при переходе: для каждого «#fff» ищем
    ближайшую заливку выше (до 14 строк). Лежит на заливке бренда — значит,
    надпись должна быть colors.brand.ink: на золоте тёмной темы белый ~2:1.
  */
  it("на заливке бренда нет белых надписей", () => {
    const WHITE = /(["'])#(?:fff|ffffff)\1/i;
    const BG = /backgroundColor:\s*([^,}\n]+)|colors=\{([^}]+)\}/;
    const offenders: string[] = [];
    for (const f of SCREENS) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!WHITE.test(l)) return;
        for (let j = i; j >= Math.max(0, i - 14); j--) {
          const m = BG.exec(lines[j]);
          if (!m) continue;
          const bg = (m[1] ?? m[2] ?? "").split("?").slice(-2).join("?");
          if (/colors\.(accent|brand)\.primary\b|Gradients\.primary/.test(bg) && !/status\./.test(bg)) {
            offenders.push(`${relative(ROOT, f).split("\\").join("/")}:${i + 1}`);
          }
          break;
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("кнопка без тени у букв; главное действие — отдельный вариант на brand.cta", () => {
    const ui = read("src/components/ui.tsx");
    expect(ui).not.toContain("textShadowColor");
    expect(ui).toContain('variant === "cta" ? { backgroundColor: colors.brand.cta }');
    expect(ui).toContain('variant === "cta" ? colors.brand.ctaInk');
  });

  it("главная: плашка выручки — hero; главные плитки — cta; подписи без капса", () => {
    const home = read("app/(tabs)/index.tsx");
    expect(home).toContain("backgroundColor: colors.hero.bg,");
    expect(home).toContain('{t("Выручка за сегодня", "Bugungi tushum")}');
    expect((home.match(/backgroundColor: colors\.brand\.cta/g) ?? []).length).toBe(3);
    for (const caps of ["НОВЫЙ ЗАКАЗ", "ТРЕКИНГ", "ДОСТАВКИ", "МАГАЗИНЫ", "БАРКОД", "ПРОФИЛЬ", "ВЫРУЧКА ЗА СЕГОДНЯ"]) {
      expect(home.includes(caps)).toBe(false);
    }
  });

  it("вход: шапка — hero, «Войти» — главное действие", () => {
    const login = read("app/(auth)/login.tsx");
    expect(login).toContain("heroBg: [colors.hero.bg, colors.hero.bg] as const,");
    expect(login).toContain("colors={[colors.brand.cta, colors.brand.cta]}");
    expect(login).not.toMatch(/color: "#fff"/);
  });
});
