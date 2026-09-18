import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Наличные на телефоне.
 *
 * Владелец: «в мобилке не хватило — у меня на руках вот столько, вот я сдал
 * в кассу».
 *
 *   · ручки cash.mine / cash.setPin позваны из api.ts;
 *   · экран заявлен в навигации со своей шапкой;
 *   · на главной у агента и курьера — карточка «наличные», в профиле —
 *     ссылка на наличные и PIN;
 *   · PIN на телефоне заводится дважды и только цифрами.
 *
 * Ван-селлинг и тара убраны 18.09.2026 (владелец: «интегрируем с другой
 * программой») — экранов van/*, ручек van.* и tare.* в мобилке нет.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const API = strip(read("src", "api.ts"));
const LAYOUT = read("app", "_layout.tsx");
const HOME = strip(read("app", "(tabs)", "index.tsx"));
const PROFILE = strip(read("app", "(tabs)", "profile.tsx"));
const CASH = strip(read("app", "cash.tsx"));
const CARDS = strip(read("src", "components", "CashCard.tsx"));

function must(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}
function screenIsRegistered(name: string): void {
  const tag = `<Stack.Screen name="${name}"`;
  must(LAYOUT.includes(tag), `экран ${name} не заявлен в навигации`);
  const at = LAYOUT.indexOf(tag);
  must(LAYOUT.slice(at, LAYOUT.indexOf("/>", at)).includes("headerShown: false"), `у экрана ${name} две шапки`);
}

describe("ручки позваны", () => {
  it("касса — из api.ts, строками процедур", () => {
    for (const [fn, path] of [["getMyCash", "cash.mine"], ["setCashPin", "cash.setPin"]]) {
      must(API.includes(`export async function ${fn}(`), `нет функции ${fn}`);
      must(API.includes(`"${path}"`), `${fn} не зовёт ${path}`);
    }
  });
  it("ван-селлинга и тары в мобилке нет: ни ручек, ни экранов", () => {
    expect(API).not.toMatch(/"(van|tare)\./);
    expect(existsSync(join(root, "app", "van"))).toBe(false);
    expect(LAYOUT).not.toContain('name="van/');
    expect(HOME).not.toContain("VanCard");
  });
});

describe("экраны на месте", () => {
  it("заявлены в навигации со своей шапкой", () => {
    screenIsRegistered("cash");
  });
  it("главная агента и курьера ведёт к наличным; профиль — к наличным и PIN", () => {
    expect((HOME.match(/<CashCard /g) ?? []).length).toBe(2);
    expect(CARDS).toContain('router.push("/cash")');
    expect(PROFILE).toContain('router.push("/cash")');
  });
});

describe("наличные", () => {
  it("на руках, сдать до, сдачи с номерами, недостача; PIN — дважды и цифрами", () => {
    for (const s of ['testID="cash-on-hand"', "m.deadline", "KIND[d.kind]", "m.debt > 0", 'testID="cash-pin"', 'testID="cash-pin-2"']) expect(CASH).toContain(s);
    expect(CASH).toContain('const pinOk = /^\\d{4,6}$/.test(pin) && pin === pin2;');
    expect(CASH).toContain('v.replace(/\\D/g, "").slice(0, 6)');
  });
});
