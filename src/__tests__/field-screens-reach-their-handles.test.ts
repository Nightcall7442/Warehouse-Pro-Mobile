import { readFileSync } from "fs";
import { join } from "path";

/**
 * Четыре функции, которых у полевых ролей не было.
 *
 * ── Что нашлось сверкой ─────────────────────────────────────────────────────
 *
 * Сверили ручки, открытые агенту, курьеру и мерчандайзеру, с тем, что зовёт
 * приложение. Из 97 оно звало 55, и среди недостающих оказались не мелочи:
 *
 *   • уведомлений не было ВООБЩЕ — толчок на телефон это сигнал, а не запись:
 *     смахнул с экрана блокировки, и узнать неоткуда;
 *   • курьер не видел своих показателей — только список сегодняшних доставок;
 *   • агент не видел, кому идти собирать деньги, — долг был виден лишь в
 *     карточке магазина, по одному;
 *   • переписка по заказу велась в вебе, а агент, которого она касается, её не
 *     видел и ответить не мог.
 *
 * Ручка без вызова — это функция, которой нет. Здесь проверяется, что каждая
 * из них теперь позвана, что до экрана можно дойти и что видно СВОЁ, а не
 * чужое.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");

const API = read("src", "api.ts");
const HOME = read("app", "(tabs)", "index.tsx");
const PROFILE = read("app", "(tabs)", "profile.tsx");
const DELIVERIES = read("app", "(tabs)", "deliveries.tsx");
const LAYOUT = read("app", "_layout.tsx");
const NOTIFICATIONS = read("app", "notifications.tsx");
const DEBTS = read("app", "debts.tsx");
const COMMENTS = read("src", "components", "order", "OrderComments.tsx");
const ORDER = read("app", "order", "[id].tsx");

/** Утверждение с объяснением: у Jest `expect` принимает один аргумент. */
function must(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}

/** Экран заявлен в навигации и со своей шапкой, а не с системной поверх. */
function screenIsRegistered(name: string): void {
  const tag = `<Stack.Screen name="${name}"`;
  must(LAYOUT.includes(tag), `экран ${name} не заявлен в навигации`);
  const at = LAYOUT.indexOf(tag);
  must(LAYOUT.slice(at, LAYOUT.indexOf("/>", at)).includes("headerShown: false"),
    `у экрана ${name} две шапки: своя и системная`);
}

describe("уведомления", () => {
  test("все пять ручек позваны", () => {
    for (const handle of [
      "notification.list", "notification.counts",
      "notification.markRead", "notification.markAllRead",
    ]) {
      must(API.includes(`"${handle}"`), `${handle} не вызывается ниоткуда`);
    }
  });

  test("счётчик стоит на главной у всех трёх ролей", () => {
    /*
      Главные три — агентская, начальничья и курьерская. Колокол один на всех:
      уведомления приходят каждому, а три копии значка разъедутся при первой же
      правке.
    */
    must(HOME.includes("function NotificationBell()"), "колокола нет");
    const uses = HOME.split("<NotificationBell />").length - 1;
    must(uses === 3, `колокол стоит на ${uses} главных из трёх`);
  });

  test("отказ по счётчику не роняет главную", () => {
    // Главная не про уведомления: значка просто не будет.
    const at = HOME.indexOf('queryKey: ["notificationCounts"]');
    must(at > 0, "запрос счётчика на главной не найден");
    must(HOME.slice(at, HOME.indexOf("});", at)).includes(".catch(() => null)"),
      "отказ по счётчику уронит главную");
  });

  test("прочитанным помечает нажатие, а не пролистывание", () => {
    /*
      Список пробегают глазами, и стирать этим непрочитанное значит решить за
      человека, что он это видел. Нажал — открыл, то есть точно прочитал.
    */
    must(NOTIFICATIONS.includes("if (!n.isRead) markOne.mutate(n.id);"),
      "отметка о прочтении сорвалась с нажатия");
    must(!NOTIFICATIONS.includes("onViewableItemsChanged"),
      "прочитанным помечает пролистывание");
  });

  test("листание вглубь идёт по идентификатору, а не по времени", () => {
    /*
      Уведомление всей смене пишется одной пачкой с одинаковым createdAt.
      Листай мы по времени — на границе страницы запись терялась бы; сервер
      поэтому и отдаёт курсор по id.
    */
    const at = NOTIFICATIONS.indexOf("getNextPageParam");
    must(at > 0, "листания вглубь нет");
    must(NOTIFICATIONS.slice(at, NOTIFICATIONS.indexOf("\n", at)).includes(".id"),
      "продолжение берётся не по идентификатору");
  });

  test("веб-адрес не подставляется в переходы приложения", () => {
    /*
      Ссылки приходят веб-адресами («/agent-kpi»), а у приложения свои экраны:
      router.push("/agent-kpi") увёл бы в никуда. Разбирается только то, чему
      на телефоне есть место.
    */
    /*
      Проверяется ВЫЗОВ, а не объявление. «function routeFor» находилось и в
      переименованной `routeForDisabled` — страж молчал на сломе, потому что
      имя осталось подстрокой. Ловится тем, что разбор должен быть позван, а в
      переход — уходить его результат.
    */
    must(/routeFor[(]/.test(NOTIFICATIONS), "разбор ссылки не вызывается");
    const at = NOTIFICATIONS.indexOf("const open = (");
    must(at > 0, "открытие уведомления не найдено");
    const open = NOTIFICATIONS.slice(at, NOTIFICATIONS.indexOf("\n  };", at));
    must(open.includes("routeFor(n)"), "переход считается не разбором ссылки");
    must(!open.includes("n.link"), "веб-адрес идёт в переход как есть");
  });

  test("экран заявлен в навигации", () => screenIsRegistered("notifications"));
});

describe("показатели курьера", () => {
  test("ручка позвана", () => {
    must(API.includes('"kpi.courierKpi"'), "kpi.courierKpi не вызывается ниоткуда");
  });

  test("итоги месяца стоят на его же вкладке доставок", () => {
    must(DELIVERIES.includes("<MonthTotals />"), "итогов месяца на экране доставок нет");
    must(DELIVERIES.includes("getCourierKpi(\"month\")"), "показатели не запрашиваются");
  });

  test("это не сегодняшние кольца — считается месяц", () => {
    /*
      Кольца выше отвечают «что осталось СЕГОДНЯ». «Сколько я отвёз за месяц» —
      другой вопрос, и по сегодняшнему дню на него не ответить.
    */
    const at = DELIVERIES.indexOf("function MonthTotals");
    const body = DELIVERIES.slice(at);
    must(body.includes("Рабочих дней"), "рабочих дней не видно");
    must(body.includes("cashCollected"), "привезённых денег не видно");
  });

  test("ноль назначенных не выдаётся за ноль процентов успеха", () => {
    // Это «мерить нечего», а не «работал плохо».
    const at = DELIVERIES.indexOf("function MonthTotals");
    must(DELIVERIES.slice(at).includes("data.delivered + data.failed > 0"),
      "при пустом месяце показывается 0% вместо прочерка");
  });

  test("отказ не роняет рабочий экран", () => {
    const at = DELIVERIES.indexOf('queryKey: ["courierKpi", "month"]');
    must(at > 0, "запрос показателей не найден");
    must(DELIVERIES.slice(at, DELIVERIES.indexOf("});", at)).includes(".catch(() => null)"),
      "отказ по показателям уронит экран доставок");
  });
});

describe("долги агента", () => {
  test("ручка позвана", () => {
    must(API.includes('"agent.myDebts"'), "agent.myDebts не вызывается ниоткуда");
  });

  test("экран заявлен и до него можно дойти", () => {
    screenIsRegistered("debts");
    must(PROFILE.includes('router.push("/debts")'), "до долгов не дойти из профиля");
  });

  test("только агенту", () => {
    /*
      У курьера своих заказов нет, а начальник смотрит долги по всей
      организации отдельным отчётом — второй путь к тому же ответу разойдётся
      с первым.
    */
    const at = PROFILE.indexOf('router.push("/debts")');
    const around = PROFILE.slice(Math.max(0, at - 1200), at);
    must(around.includes("{isAgent && ("), "долги открыты не только агенту");
  });

  test("видно возраст долга, а не только сумму", () => {
    // «Вчера отгрузили» и «забыли полгода назад» по сумме выглядят одинаково.
    must(DEBTS.includes("дн."), "возраст долга не показан");
  });

  test("«сейчас» берётся один раз, а не на каждой отрисовке", () => {
    /*
      Date.now() прямо в разметке делает отрисовку неповторяемой. Ровно на этом
      уже спотыкались в вебе (PendingInvites), и здесь линтер поймал то же.
    */
    must(DEBTS.includes("const [now] = useState(() => Date.now())"),
      "«сейчас» считается на каждой отрисовке");
    const at = DEBTS.indexOf("function DebtRow");
    must(!DEBTS.slice(at).includes("Date.now()"), "в строке долга снова Date.now()");
  });
});

describe("переписка по заказу", () => {
  test("обе ручки позваны", () => {
    must(API.includes('"order.listComments"'), "order.listComments не вызывается ниоткуда");
    must(API.includes('"order.addComment"'), "order.addComment не вызывается ниоткуда");
  });

  test("блок стоит в карточке заказа", () => {
    must(ORDER.includes("<OrderComments orderId={Number(id)} />"), "переписки в карточке заказа нет");
  });

  test("ветки ответов видны", () => {
    // Ответ без ветки выглядит новым сообщением ни о чём.
    must(COMMENTS.includes("c.replies"), "ответы показаны вперемешку с корнями");
    must(COMMENTS.includes("depth * Spacing.lg"), "вложенность ответов не видна");
  });

  test("пустое не отправляется", () => {
    must(COMMENTS.includes("draft.trim().length > 0"), "можно отправить пустое сообщение");
  });

  test("предел длины тот же, что у сервера", () => {
    /*
      Сервер принимает 2000 знаков. Обрежь мы молча — человек дописал бы
      длинное сообщение и потерял хвост, не узнав об этом.
    */
    must(COMMENTS.includes("maxLength={2000}"), "предел длины разошёлся с серверным");
  });
});

describe("визиты и доставки: дыры, найденные разбором удобства ролей 13.09", () => {
  const PLAN = read("app", "(tabs)", "plan.tsx");
  const DELIVER = read("app", "order", "deliver.tsx");

  it("«Готово» у мерчандайзера открывает отчёт о визите, а не ставит галочку", () => {
    /*
      Единственный переход на /merchandiser/visit лежал в AgentPlansView —
      на вкладке, которой у мерчандайзера нет. В бою роль не производила ни
      одного отчёта, а KPI считал визиты сделанными.
    */
    expect(PLAN).toContain('pathname: "/merchandiser/visit"');
    expect(PLAN).toMatch(/isMerchandiser[\s\S]{0,200}router\.push/);
  });

  it("отметка визита агента без связи ложится в очередь, а не в «повторите позже»", () => {
    expect(PLAN).toContain("useVisitQueue");
    expect(PLAN).toContain("queueVisit.add(");
    expect(PLAN).toContain("isRetryableError(e)");
  });

  it("отвергнутая сервером отметка курьера — с текстом и кнопками «Повторить» / «Убрать»", () => {
    // Раньше она висела в «ЖДУТ ОТПРАВКИ» до конца дня без объяснения и
    // без выхода: кнопки были только на вкладке «Заказы», скрытой у курьера.
    expect(DELIVERIES).toContain("retryDeliveryAction(failed.id)");
    expect(DELIVERIES).toContain("discardDeliveryAction(failed.id)");
    expect(DELIVERIES).toContain('a.status === "failed"');
  });

  it("частичный возврат — вместе с деньгами; дата долга разбирается как пишут люди", () => {
    expect(DELIVER).toContain('result === "partial_returned"');
    expect(DELIVER).toMatch(/showPaymentFields = .*partial_returned/);
    expect(DELIVER).toContain("parseDueDate(debtDueDate)");
  });
});
