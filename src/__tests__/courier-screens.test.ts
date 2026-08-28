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
    if (!LAYOUT.includes(`if (route.name === "deliveries") return isCourier;`)) {
      throw new Error("правило видимости доставок пропало");
    }
  });

  test("профиль доставщику доступен", () => {
    // Выход из аккаунта живёт только в профиле.
    const at = LAYOUT.indexOf(`if (route.name === "profile")`);
    if (at < 0) throw new Error("правило видимости профиля пропало");
    const rule = LAYOUT.slice(at, LAYOUT.indexOf("}", at));
    if (!rule.includes("isCourier")) {
      throw new Error("профиль снова скрыт у доставщика");
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
    if (!DELIVERIES.includes(`const queued = (deliveries ?? []).filter((d: Delivery) => queuedOrderIds.has(d.id));`)) {
      throw new Error("список отложенных отметок пропал");
    }
    if (!DELIVERIES.includes('title="ЖДУТ ОТПРАВКИ"')) {
      throw new Error("раздел с отложенными отметками больше не рисуется");
    }
  });

  test("человеку сказано, что отметка записана и уйдёт позже", () => {
    const at = DELIVERIES.indexOf('title="ЖДУТ ОТПРАВКИ"');
    const section = DELIVERIES.slice(at, at + 2000);
    if (!/Записано на телефоне/.test(section)) {
      throw new Error("объяснение исчезло: карточка есть, а что с ней — непонятно");
    }
  });

  test("повторно отметить ту же доставку нельзя", () => {
    // Оставить карточку с рабочими кнопками — значит разрешить вторую отметку
    // по той же доставке до того, как уйдёт первая.
    for (const list of ["assigned", "inTransit"]) {
      const at = DELIVERIES.indexOf("const " + list + " = ");
      if (at < 0) throw new Error("список «" + list + "» пропал");
      const line = DELIVERIES.slice(at, DELIVERIES.indexOf(String.fromCharCode(10), at));
      if (!line.includes("!queuedOrderIds.has(d.id)")) {
        throw new Error("«" + list + "» больше не исключает отложенные — доставку можно отметить дважды");
      }
    }
  });
});
