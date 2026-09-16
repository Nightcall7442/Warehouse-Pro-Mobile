import { readFileSync } from "fs";
import { join } from "path";

/**
 * Тара на телефоне: водитель принимает пустую тару от магазина на свою машину.
 *
 *   · ручки tare.status / tare.overview / tare.shop / tare.returnFromShop
 *     позваны из api.ts строками процедур;
 *   · экран заявлен в навигации со своей шапкой;
 *   · на «Моей машине» тара и кнопка приёма — только при включённом учёте;
 *   · приём идёт на СВОЮ машину (warehouseId = vanId из параметров), не
 *     больше, чем у магазина числится; пустой список не отправить;
 *   · залог показан водителю, если он есть.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const API = strip(read("src", "api.ts"));
const LAYOUT = read("app", "_layout.tsx");
const VAN = strip(read("app", "van", "index.tsx"));
const TARE = strip(read("app", "van", "tare.tsx"));

function must(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}

describe("тара на телефоне", () => {
  it("ручки позваны из api.ts строками процедур", () => {
    for (const [fn, path] of [
      ["getTareStatus", "tare.status"], ["getTareOverview", "tare.overview"], ["getShopTare", "tare.shop"], ["returnTareFromShop", "tare.returnFromShop"],
    ]) {
      must(API.includes(`export async function ${fn}(`), `нет функции ${fn}`);
      must(API.includes(`"${path}"`), `ручка ${path} не позвана строкой`);
    }
  });

  it("экран заявлен в навигации со своей шапкой", () => {
    const tag = '<Stack.Screen name="van/tare"';
    must(LAYOUT.includes(tag), "экран van/tare не заявлен в навигации");
    const at = LAYOUT.indexOf(tag);
    must(LAYOUT.slice(at, LAYOUT.indexOf("/>", at)).includes("headerShown: false"), "у экрана van/tare две шапки");
  });

  it("«Моя машина»: тара и кнопка приёма — только при включённом учёте; ведёт на /van/tare со своей машиной", () => {
    must(VAN.includes("const tareOn = tareStatus.data?.enabled === true;"), "тумблер учёта тары не читается");
    must(VAN.includes("{tareOn && ("), "карточка тары не спрятана за тумблером");
    must(VAN.includes("enabled: tareOn && !!van"), "обзор тары зовётся и без учёта");
    must(VAN.includes('pathname: "/van/tare", params: { vanId: String(van.id) }'), "кнопка не ведёт на приём своей машины");
  });

  it("приём — на свою машину, не больше, чем числится; пустое не отправить; залог показан", () => {
    must(TARE.includes("returnTareFromShop({ shopId: shopId!, warehouseId: vanId, items,"), "приём идёт не на свою машину");
    must(TARE.includes("Math.max(0, Math.min(h.qty, n))"), "можно принять больше, чем у магазина числится");
    must(TARE.includes("disabled={n >= h.qty}"), "«+» не упирается в остаток магазина");
    must(TARE.includes("const canSubmit = !!shopId && items.length > 0 && !ret.isPending"), "пустой приём можно отправить");
    must(TARE.includes('testID="van-tare-deposit"'), "залог водителю не показан");
    must(TARE.includes('qc.invalidateQueries({ queryKey: ["tareOverview"] })'), "после приёма «Моя машина» не обновится");
  });
});
