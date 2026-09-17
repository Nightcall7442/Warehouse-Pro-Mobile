import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { isTabVisible } from "../lib/tabs";

/**
 * iPhone: панель вкладок и safe-area (владелец, 17.09.2026: «в айфонах
 * ублюдски выглядит, у супервайзера слишком много табов»).
 *
 *   · надзору — ровно четыре вкладки: главная, карта, планы, магазины;
 *     оператору (без карты) — три; агенту — пять, как было; «нормы» ни у
 *     кого не вкладка, но дверь к ним есть — из «Планов», со стрелкой назад;
 *   · навигатор не рисует свою шапку над экранами, которые рисуют свою:
 *     иначе на iOS две шапки, а у «gps» — имя маршрута в заголовке;
 *   · каждый экран во вкладках красит корень цветом фона, отбивает верх под
 *     чёлку (insets.top или ScreenHeader) и низ под плавающую панель
 *     (insets.bottom) — иначе на iPhone белые/чёрные пятна и карточки под
 *     панелью;
 *   · карточка заказа отбивает низ под домашнюю полоску.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const LAYOUT = strip(read("app", "(tabs)", "_layout.tsx"));

function must(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const visible = (role: string) => ["index", "shops", "catalog", "orders", "plan", "plans", "targets", "deliveries", "profile", "debtors", "gps", "tracking", "barcode"].filter(n => isTabVisible(n, role));

describe("панель вкладок", () => {
  it("надзор — четыре; оператор — три; агент — пять; «нормы» — ни у кого", () => {
    expect(visible("supervisor").sort()).toEqual(["index", "plans", "shops", "tracking"]);
    expect(visible("ceo").sort()).toEqual(["index", "plans", "shops", "tracking"]);
    expect(visible("operator").sort()).toEqual(["index", "plans", "shops"]);
    expect(visible("agent").sort()).toEqual(["catalog", "index", "orders", "profile", "shops"]);
    for (const role of ["supervisor", "ceo", "operator", "agent", "courier", "merchandiser"]) expect(isTabVisible("targets", role)).toBe(false);
  });
  it("карта стоит второй; к нормам ведёт кнопка из «Планов», обратно — стрелка", () => {
    expect(LAYOUT.indexOf('name="tracking"')).toBeLessThan(LAYOUT.indexOf('name="shops"'));
    expect(strip(read("src", "components", "plans", "SupervisorPlansView.tsx"))).toContain('router.push("/(tabs)/targets")');
    const targets = strip(read("app", "(tabs)", "targets.tsx"));
    expect(targets).toContain("router.back()");
    expect(targets).toContain('<Feather name="arrow-left"');
  });
  it("экраны со своей шапкой не получают вторую от навигатора; у gps — заголовок, а не имя маршрута", () => {
    for (const name of ["orders", "gps", "barcode", "tracking"]) {
      const m = new RegExp(`<Tabs\\.Screen[^>]*name="${name}"[\\s\\S]*?\\/>`).exec(LAYOUT);
      must(m !== null, `экран ${name} не заявлен`);
      must(m![0].includes("headerShown: false"), `у экрана ${name} две шапки`);
    }
    expect(LAYOUT).toMatch(/name="gps" options=\{\{ title: t\("Геолокация"/);
  });
});

describe("safe-area на iPhone", () => {
  const screens = readdirSync(join(root, "app", "(tabs)")).filter(f => f.endsWith(".tsx") && f !== "_layout.tsx" && f !== "plans.tsx");
  it("каждый экран во вкладках: корень крашен, верх под чёлку, низ под панель", () => {
    const files = [...screens.map(f => ["app", "(tabs)", f]), ["src", "components", "plans", "SupervisorPlansView.tsx"], ["src", "components", "plans", "AgentPlansView.tsx"]];
    for (const p of files) {
      const src = strip(read(...p));
      must(/flex: 1, backgroundColor: colors\.bg\.primary|backgroundColor: colors\.bg\.primary, flex: 1/.test(src), `${p.at(-1)}: корень не крашен`);
      must(/insets\.top|<ScreenHeader/.test(src), `${p.at(-1)}: верх не отбит под чёлку`);
      must(src.includes("insets.bottom"), `${p.at(-1)}: низ не отбит под панель`);
    }
  });
  it("карточка заказа отбивает низ под домашнюю полоску", () => {
    expect(read("src", "components", "order", "OrderStyles.tsx")).toContain("paddingBottom: Spacing.base + bottomInset + 24");
    expect(read("app", "order", "[id].tsx")).toContain("makeStyles(colors, insets.top, insets.bottom)");
  });
});
