import { readFileSync } from "fs";
import { join } from "path";

/**
 * Наличные и машина на телефоне.
 *
 * Владелец: «в мобилке не хватило — у меня на руках вот столько, вот я сдал
 * в кассу», и ван-селлинг: водитель продаёт с телефона и отдаёт чек.
 *
 *   · ручки cash.mine / cash.setPin / van.* / order.receipt позваны из api.ts;
 *   · экраны заявлены в навигации со своей шапкой;
 *   · на главной у агента и курьера — карточки «наличные» и «моя машина»,
 *     в профиле — ссылка на наличные и PIN;
 *   · продажа идемпотентна (ключ рождается вместе с экраном) и после успеха
 *     ведёт на чек; чек — HTML с сервера, PDF через expo-print, ссылка через
 *     Share; количество не выйдет за годный остаток машины;
 *   · PIN на телефоне заводится дважды и только цифрами.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const API = strip(read("src", "api.ts"));
const LAYOUT = read("app", "_layout.tsx");
const HOME = strip(read("app", "(tabs)", "index.tsx"));
const PROFILE = strip(read("app", "(tabs)", "profile.tsx"));
const CASH = strip(read("app", "cash.tsx"));
const VAN = strip(read("app", "van", "index.tsx"));
const SELL = strip(read("app", "van", "sell.tsx"));
const RECEIPT = strip(read("app", "van", "receipt.tsx"));
const CARDS = strip(read("src", "components", "MoneyAndVanCards.tsx"));

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
  it("касса, машина и чек — из api.ts, строками процедур", () => {
    for (const [fn, path] of [
      ["getMyCash", "cash.mine"], ["setCashPin", "cash.setPin"],
      ["getVanStatus", "van.status"], ["getMyVans", "van.list"], ["getVanStock", "van.stock"],
      ["vanSale", "van.sale"], ["getVanSales", "van.sales"], ["getVanShops", "van.shops"], ["getOrderReceipt", "order.receipt"],
    ]) {
      must(API.includes(`export async function ${fn}(`), `нет функции ${fn}`);
      must(API.includes(`"${path}"`), `${fn} не зовёт ${path}`);
    }
  });
});

describe("экраны на месте", () => {
  it("заявлены в навигации со своей шапкой", () => {
    for (const s of ["cash", "van/index", "van/sell", "van/receipt"]) screenIsRegistered(s);
  });
  it("главная агента и курьера ведёт к наличным и машине; профиль — к наличным и PIN", () => {
    expect((HOME.match(/<CashCard /g) ?? []).length).toBe(2);
    expect((HOME.match(/<VanCard /g) ?? []).length).toBe(2);
    expect(CARDS).toContain('router.push("/cash")');
    expect(CARDS).toContain('router.push("/van")');
    expect(PROFILE).toContain('router.push("/cash")');
  });
  it("карточка машины — только при включённом ван-селлинге и назначенной машине", () => {
    expect(CARDS).toContain('enabled: status.data?.enabled === true');
    expect(CARDS).toContain("if (!van) return null;");
  });
});

describe("наличные", () => {
  it("на руках, сдать до, сдачи с номерами, недостача; PIN — дважды и цифрами", () => {
    for (const s of ['testID="cash-on-hand"', "m.deadline", "KIND[d.kind]", "m.debt > 0", 'testID="cash-pin"', 'testID="cash-pin-2"']) expect(CASH).toContain(s);
    expect(CASH).toContain('const pinOk = /^\\d{4,6}$/.test(pin) && pin === pin2;');
    expect(CASH).toContain('v.replace(/\\D/g, "").slice(0, 6)');
  });
});

describe("продажа с машины", () => {
  it("количество в пределах годного остатка; ключ идемпотентности с экраном; после успеха — чек", () => {
    expect(SELL).toContain("Math.max(0, Math.min(r.sellable, n))");
    expect(SELL).toMatch(/const \[key\] = useState\(\(\) => `van-/);
    expect(SELL).toContain("idempotencyKey: key");
    expect(SELL).toContain('router.replace({ pathname: "/van/receipt", params: { id: String(r.id), fresh: "1" } })');
    expect(SELL).toContain('getVanShops(');
  });
  it("не в долг — без суммы не продать; в долг — сумма не спрашивается", () => {
    expect(SELL).toContain('(method === "debt" || paidValue > 0)');
    expect(SELL).toContain('{method !== "debt" && (');
  });
  it("экран машины ведёт на продажу и на чек продажи", () => {
    expect(VAN).toContain('pathname: "/van/sell"');
    expect(VAN).toContain('pathname: "/van/receipt"');
  });
});

describe("чек", () => {
  it("HTML с сервера в WebView; PDF через expo-print + expo-sharing; печать системная; ссылка через Share", () => {
    expect(RECEIPT).toContain("source={{ html: q.data.html }}");
    expect(RECEIPT).toContain("Print.printToFileAsync({ html: q.data.html, width: 226");
    expect(RECEIPT).toContain("Sharing.shareAsync(uri");
    expect(RECEIPT).toContain("Print.printAsync({ html: q.data.html, width: 226 })");
    expect(RECEIPT).toContain("Share.share({ message:");
    expect(RECEIPT).toContain("q.data.url");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["expo-print"]).toBeTruthy();
    expect(pkg.dependencies["expo-sharing"]).toBeTruthy();
  });
});
