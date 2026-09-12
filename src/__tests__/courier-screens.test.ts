import { readFileSync } from "fs";
import { join } from "path";

/**
 * Экраны доставщика.
 *
 * Две находки, обе про одно: работа курьера была не видна там, где он её
 * ищет.
 */
const root = join(__dirname, "..", "..");
const LAYOUT = readFileSync(join(root, "app", "(tabs)", "_layout.tsx"), "utf8");
const DELIVERIES = readFileSync(join(root, "app", "(tabs)", "deliveries.tsx"), "utf8");
// Правило видимости вкладок живёт отдельным модулем — спрашиваем у него, а не
// у текста экрана.
import { isTabVisible } from "../lib/tabs";

describe("у доставщика есть панель, а не один пункт", () => {
  test("экран доставок не спрятан от всех подряд", () => {
    // «deliveries» лежал в списке всегда скрытых. У доставщика оставалась одна
    // вкладка — «Главная», — а на сам экран доставок он попадал с главной, и
    // панель внизу этого экрана его не показывала.
    const at = LAYOUT.indexOf("const ALWAYS_HIDDEN");
    const line = LAYOUT.slice(at, LAYOUT.indexOf("\n", at));
    if (line.includes("deliveries")) {
      throw new Error("экран доставок снова скрыт у всех ролей, включая доставщика");
    }
  });

  test("доставки показываются доставщику", () => {
    if (!isTabVisible("deliveries", "courier")) {
      throw new Error("правило видимости доставок пропало");
    }
  });

  test("профиль доставщику доступен", () => {
    // Выход из аккаунта живёт только в профиле.
    if (!isTabVisible("profile", "courier")) {
      throw new Error("профиль снова скрыт у доставщика");
    }
  });

  test("у доставщика видно больше одного пункта", () => {
    // Панель из одного пункта — это не панель: до всего остального нечем
    // дойти. Считаем по тому же правилу, которым пользуется сам экран.
    const all = ["index", "shops", "catalog", "orders", "plan", "plans", "targets", "deliveries", "profile", "gps", "tracking", "barcode"];
    const visible = all.filter(name => isTabVisible(name, "courier"));
    if (visible.length < 2) {
      throw new Error("у доставщика в панели остался один пункт: " + visible.join(", "));
    }
  });

  test("в панели доставщика не остаётся одного пункта", () => {
    // Пересчёт по тем же правилам, что и в самом файле: index виден всем,
    // shops и агентские вкладки — нет, планы и нормы — только руководителю.
    const hiddenLine = LAYOUT.slice(LAYOUT.indexOf("const ALWAYS_HIDDEN"));
    const alwaysHidden = (hiddenLine.slice(0, hiddenLine.indexOf("\n")).match(/"(\w+)"/g) ?? [])
      .map(s => s.replace(/"/g, ""));
    const all = ["index", "shops", "catalog", "orders", "plan", "plans", "targets", "deliveries", "profile", "gps", "tracking", "barcode"];
    const visible = all.filter(name => {
      if (alwaysHidden.includes(name)) return false;
      if (name === "catalog" || name === "orders") return false;   // не доставщику
      if (name === "profile") return true;                          // доставщику доступен
      if (name === "plans" || name === "targets") return false;     // руководителю
      if (name === "shops") return false;                           // не доставщику
      if (name === "deliveries") return true;
      return true;
    });
    if (visible.length < 3) {
      throw new Error(`у доставщика в панели ${visible.length} пункт(а): ${visible.join(", ")}`);
    }
  });
});

describe("отмеченная без сети доставка не пропадает", () => {
  test("для отложенных отметок есть свой раздел", () => {
    // Заказ, отмеченный без сети, выпадал из «ожидают» и «в пути» (сервер о
    // нём ещё не знает), а в «доставлены» попасть не мог. Карточка исчезала,
    // и понять, записалось ли хоть что-то, было нельзя.
    if (!/queued:\s*all\.filter\(\(d: Delivery\) => queuedOrderIds\.has\(d\.id\)\)/.test(DELIVERIES)) {
      throw new Error("список отложенных отметок пропал");
    }
    if (!DELIVERIES.includes("ЖДУТ ОТПРАВКИ")) {
      throw new Error("раздел с отложенными отметками больше не рисуется");
    }
  });

  test("человеку сказано, что отметка записана и уйдёт позже", () => {
    if (!/Записано на телефоне/.test(DELIVERIES)) {
      throw new Error("объяснение исчезло: карточка есть, а что с ней — непонятно");
    }
  });

  test("повторно отметить ту же доставку нельзя", () => {
    // Оставить карточку с рабочими кнопками — значит разрешить вторую отметку
    // по той же доставке до того, как уйдёт первая.
    for (const list of ["assigned", "inTransit"]) {
      const at = DELIVERIES.indexOf(list + ": all.filter(");
      if (at < 0) throw new Error("список «" + list + "» пропал");
      const line = DELIVERIES.slice(at, DELIVERIES.indexOf(String.fromCharCode(10), at));
      if (!line.includes("!queuedOrderIds.has(d.id)")) {
        throw new Error("«" + list + "» больше не исключает отложенные — доставку можно отметить дважды");
      }
    }
  });
});

describe("без сети — не одно действие на заказ", () => {
  test("отложенный «выехал» показывает заказ «В ПУТИ» с кнопками, а не в «ждут отправки»", () => {
    // Раньше любая отложенная отметка убирала заказ в «ЖДУТ ОТПРАВКИ» без
    // кнопок: «выехал» без связи — и «доставлен» ждал сети. Очередь уходит
    // по порядку, поэтому «выехал» — середина, а не конец.
    if (!/queuedOrderIds = useMemo\([\s\S]*?type !== "markOutForDelivery"/.test(DELIVERIES)) {
      throw new Error("«ждут отправки» снова считает «выехал» концом работы");
    }
    if (!/inTransit: all\.filter\(\(d: Delivery\) => \(d\.deliveryStatus === "out_for_delivery" \|\| locallyOut\.has\(d\.id\)\)/.test(DELIVERIES)) {
      throw new Error("заказ с отложенным «выехал» не попадает в «В ПУТИ»");
    }
    if (!/assigned: all\.filter\([^\n]*!locallyOut\.has\(d\.id\)/.test(DELIVERIES)) {
      throw new Error("заказ с отложенным «выехал» остаётся и в «ожидают» — двойная карточка");
    }
  });
});
