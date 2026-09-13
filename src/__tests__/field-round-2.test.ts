import { readFileSync } from "fs";
import { join } from "path";
import { mapUrl, failReason, FAIL_REASONS, FAIL_REASON_MAX } from "../lib/courier-route";
import { offlineOrderTotal } from "../lib/order-money";

/**
 * Второй круг удобства полевых ролей (13.09).
 *
 * Курьер: «выехал по всем» одной кнопкой, причина у «не доставлено», карта
 * по координатам, состав заказа на экране доставки, первая точка маршрута
 * видна без прокрутки. Агент: долги плиткой на главной, остаток в окне
 * выбора товара, отложенные заказы карточками; мерчандайзер без чужих
 * блоков.
 *
 * Чистая часть проверяется вызовом, экранная — по тексту, как в соседних
 * стражах: экран с навигацией, запросами и камерой в тесте не поднять.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");

const DELIVERIES = read("app", "(tabs)", "deliveries.tsx");
const DELIVER = read("app", "order", "deliver.tsx");
const HOME = read("app", "(tabs)", "index.tsx");
const NEW_ORDER = read("app", "order", "new.tsx");
const ORDERS = read("app", "(tabs)", "orders.tsx");

function must(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}

describe("карта по координатам", () => {
  it("есть координаты — маршрут до точки, а не поиск по тексту", () => {
    const url = mapUrl({ shopGpsLat: "41.311", shopGpsLng: "69.279", shopAddress: "ул. Навои, 12" });
    expect(url).toBe("https://yandex.ru/maps/?rtext=~41.311,69.279&rtt=auto");
  });

  it("без координат — адрес с городом; нули и мусор координатами не считаются", () => {
    expect(mapUrl({ shopGpsLat: null, shopGpsLng: null, shopAddress: "ул. Навои, 12", shopCity: "Ташкент" }))
      .toBe(`https://yandex.ru/maps/?text=${encodeURIComponent("ул. Навои, 12, Ташкент")}`);
    expect(mapUrl({ shopGpsLat: "0", shopGpsLng: "0", shopAddress: "адрес" })).toContain("text=");
    expect(mapUrl({ shopGpsLat: "abc", shopGpsLng: "69", shopAddress: "адрес" })).toContain("text=");
  });

  it("нет ни того ни другого — кнопки не будет", () => {
    expect(mapUrl({ shopGpsLat: null, shopGpsLng: null, shopAddress: null })).toBeNull();
    // Обе карточки прячут кнопку по тому же правилу, а не по одному адресу.
    must(DELIVERIES.split("{mapUrl(order) && (").length - 1 === 2, "кнопка «На карте» не зависит от mapUrl на обеих карточках");
    must(!DELIVERIES.includes("yandex.ru/maps/?text="), "экран снова строит адрес карты сам");
  });
});

describe("«не доставлено» — с причиной", () => {
  it("три причины, «другое» — свой текст, пустое — не причина", () => {
    expect(FAIL_REASONS).toEqual(["Магазин закрыт", "Нет денег", "Отказался от товара"]);
    expect(failReason("Нет денег", "")).toBe("Нет денег");
    expect(failReason("other", "  хозяина нет  ")).toBe("хозяина нет");
    expect(failReason("other", "   ")).toBeNull();
    expect(failReason(null, "текст без выбора")).toBeNull();
  });

  it("свой текст не длиннее серверного предела", () => {
    expect(FAIL_REASON_MAX).toBe(500);
    expect(failReason("other", "x".repeat(600))?.length).toBe(500);
    must(DELIVERIES.includes("maxLength={FAIL_REASON_MAX}"), "поле причины не ограничено пределом сервера");
  });

  it("отметка уходит с причиной, а окно без причины глухое", () => {
    must(DELIVERIES.includes("mutateFail({ order, reason })"), "причина не доходит до markFailed");
    must(!DELIVERIES.includes("mutateFail({ order })"), "«не доставлено» снова уходит без причины");
    must(DELIVERIES.includes("disabled={!reason}"), "кнопку можно нажать без причины");
  });
});

describe("«выехал по всем»", () => {
  it("кнопка стоит над «ОЖИДАЮТ ДОСТАВКИ» и гонит ту же мутацию по порядку", () => {
    const at = DELIVERIES.indexOf('rows.push({ type: "take-all"');
    // Заголовок идёт парой t("ru", "uz") — страж ищет русское слово в паре.
    const header = DELIVERIES.indexOf('title: t("ОЖИДАЮТ ДОСТАВКИ"');
    must(at > 0 && at < header, "кнопки «Выехал по всем» нет над разделом ожидающих");
    // Подряд через await, а не Promise.all: очередь без сети ложится по одной
    // в порядке списка, а на сети в полёте один запрос.
    must(/for \(const order of orders\) \{\s*try \{ await mutateOutAsync\(order\); \}/.test(DELIVERIES),
      "точки уходят не по одной и не по порядку");
    must(!/Promise\.all\([^)]*mutateOut/.test(DELIVERIES), "«по всем» стреляет всеми разом");
  });

  it("новой ручки не появилось — та же markOutForDelivery", () => {
    must(!/markOutForDeliveryAll|markAllOut|takeAllOut"/.test(DELIVERIES), "выдумана новая ручка");
  });

  it("пока идёт «по всем», тосты и перезапросы на каждую точку молчат", () => {
    must(/if \(bulkOut\.current\) return;\s*qc\.invalidateQueries/.test(DELIVERIES), "тридцать тостов и перезапросов на тридцать точек");
  });
});

describe("первая точка маршрута видна сразу", () => {
  it("итоги месяца — в подвале списка, колец над ним нет", () => {
    must(DELIVERIES.includes("ListFooterComponent={<MonthTotals />}"), "итоги месяца не в подвале");
    must(!DELIVERIES.includes("ListHeaderComponent"), "над маршрутом снова блок");
    must(!DELIVERIES.includes("ProgressRing"), "кольца вернулись");
    must(DELIVERIES.includes("Ожидают ${assigned.length} · В пути ${inTransit.length}"), "строки «Ожидают N · В пути M» нет");
  });
});

describe("состав заказа курьеру", () => {
  it("позиции стоят под заголовком всегда, а не только при частичном возврате", () => {
    const items = DELIVER.indexOf('testID="deliver-items"');
    const result = DELIVER.indexOf("РЕЗУЛЬТАТ ДОСТАВКИ");
    must(items > 0 && items < result, "состава нет над выбором результата");
    // Блок не обёрнут в условие по результату: между заголовком и составом
    // не должно быть showReturnFields / result ===.
    const between = DELIVER.slice(DELIVER.indexOf("Доставка: {order.orderNumber}"), items);
    must(!/showReturnFields|result ===/.test(between), "состав показывается только при возврате");
    must(DELIVER.slice(items, result).includes("{item.productName}"), "в составе нет названий");
    must(DELIVER.slice(items, result).includes("qty(item.quantity)"), "в составе нет количества");
  });
});

describe("долги на главной агента", () => {
  it("плитка ведёт в /debts и считается по тому же запросу, что и экран долгов", () => {
    must(HOME.includes('queryKey: ["myDebts"]'), "долги на главной не запрашиваются");
    must(HOME.includes('router.push("/debts")'), "плитка долгов никуда не ведёт");
    must(/enabled: isAgent,/.test(HOME), "долги запрашиваются не только у агента");
    must(/getMyDebts\(\)\.catch\(\(\) => null\)/.test(HOME), "отказ по долгам уронит главную");
  });

  it("считает магазины, а не строки", () => {
    must(HOME.includes("new Set(myDebts.map(d => d.shopId)).size"), "долги считаются по накладным, а не по точкам");
  });
});

describe("главная мерчандайзера без чужих блоков", () => {
  it("тренд выручки, новый заказ, баркод и заказы дня — только тем, кто продаёт", () => {
    const gated = HOME.split("{sells && (").length - 1;
    must(gated >= 5, `за sells стоит ${gated} блоков, ждём тренд, новый заказ, баркод, выручку и заказы дня`);
    must(HOME.includes('const sells = isAgentRole && !isMerchandiser;'), "правило «продаёт» пропало");
    for (const q of ['queryKey: ["revenueTrend"]', 'queryKey: ["myOrders"]']) {
      const at = HOME.indexOf(q);
      must(HOME.slice(at, HOME.indexOf("});", at)).includes("enabled: sells"), `${q} запрашивается у мерчандайзера`);
    }
  });

  it("визиты остаются всем", () => {
    const at = HOME.indexOf('queryKey: ["plans", "today"]');
    must(HOME.slice(at, HOME.indexOf("});", at)).includes("enabled: isAgentRole"), "визиты отняли у мерчандайзера");
  });
});

describe("остаток в окне выбора товара", () => {
  it("остаток стоит рядом с ценой, «+» глохнет на границе", () => {
    must(NEW_ORDER.includes("testID={`picker-stock-${p.id}`}"), "остатка рядом с ценой нет");
    must(NEW_ORDER.includes("const atLimit = stock != null && qty >= stock;"), "граница остатка не считается");
    must(NEW_ORDER.includes("testID={`stepper-plus-${p.id}`} disabled={atLimit}"), "«+» жмётся сверх остатка");
    must(NEW_ORDER.includes("if (added || atLimit) return;"), "первый «+» жмётся при нулевом остатке");
  });

  it("пустая корзина открывает окно сразу", () => {
    must(NEW_ORDER.includes("useState(lines.length === 0)"), "окно выбора не открывается само на пустой корзине");
  });
});

describe("отложенные заказы — карточками", () => {
  it("сумма: названная владельцу, а у старых записей — по строкам", () => {
    const items = [{ unitPrice: 1000, quantity: 3, discount: 10 }];
    expect(offlineOrderTotal({ quotedTotal: 2500, input: { items } })).toBe(2500);
    expect(offlineOrderTotal({ input: { items } })).toBe(2700);
  });

  it("в списке заказов отложенные стоят первыми с магазином, суммой, временем и значком", () => {
    const at = ORDERS.indexOf('result.push({ type: "pending", order, key: `p-${order.id}` })');
    must(at > 0, "отложенные не попадают в список");
    must(at < ORDERS.indexOf("for (const order of sorted)"), "отложенные не первые");
    const card = ORDERS.slice(ORDERS.indexOf('if (item.type === "pending")'), ORDERS.indexOf("const order = item.order;"));
    must(card.includes("{o.shopName}"), "на карточке нет магазина");
    must(card.includes("offlineOrderTotal(o)"), "на карточке нет суммы");
    must(card.includes('"HH:mm"'), "на карточке нет времени");
    must(card.includes("Ожидает отправки"), "на карточке нет значка «ожидает отправки»");
  });
});
