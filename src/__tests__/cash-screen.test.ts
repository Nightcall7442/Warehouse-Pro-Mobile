import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Наличные на руках — по расчёту заказов (касса убрана 18.09.2026: «деньги
 * живут в заказе»).
 *
 *   · ручка order.myCash позвана из api.ts; ручек cash.* нет;
 *   · экрана cash и ссылки на него нет; van/* и tare.* тоже нет;
 *   · на главной у агента и курьера — карточка «на руках», и она молчит,
 *     когда сдавать нечего.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const API = strip(read("src", "api.ts"));
const LAYOUT = read("app", "_layout.tsx");
const HOME = strip(read("app", "(tabs)", "index.tsx"));
const PROFILE = strip(read("app", "(tabs)", "profile.tsx"));
const CARD = strip(read("src", "components", "CashCard.tsx"));

describe("наличные на руках", () => {
  it("ручка — order.myCash; кассы, вана и тары в api.ts нет", () => {
    expect(API).toContain("export async function getMyCash(");
    expect(API).toContain('"order.myCash"');
    expect(API).not.toMatch(/"(cash|van|tare)\./);
  });
  it("экранов cash и van/* нет, ссылок на них нет", () => {
    expect(existsSync(join(root, "app", "cash.tsx"))).toBe(false);
    expect(existsSync(join(root, "app", "van"))).toBe(false);
    expect(LAYOUT).not.toContain('name="cash"');
    expect(LAYOUT).not.toContain('name="van/');
    expect(PROFILE).not.toContain('router.push("/cash")');
    expect(HOME).not.toContain("VanCard");
  });
  it("карточка на главной у агента и курьера; молчит без наличных", () => {
    expect((HOME.match(/<CashCard /g) ?? []).length).toBe(2);
    expect(CARD).toContain("if (!m || m.amount <= 0) return null;");
    expect(CARD).toContain('queryFn: getMyCash');
  });
});
