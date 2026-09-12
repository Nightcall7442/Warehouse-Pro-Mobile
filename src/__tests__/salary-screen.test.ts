import { readFileSync } from "fs";
import { join } from "path";

/**
 * Зарплата на телефоне.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Зарплату получают агенты и курьеры — те, у кого веба нет вовсе, — а
 * посмотреть её на телефоне было негде. В KpiSummaryCard стоял блок
 * `{kpi.salary && …}`, и он не рисовался НИКОГДА: `kpi.agentKpi` поля `salary`
 * не возвращает и не возвращал. Блок ждал числа, которого в ответе нет, и со
 * стороны это выглядело как «зарплату на телефоне не показывают».
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Что число берётся у СВОЕЙ ручки, что на экране оно разложено (одной суммой
 * человек её не проверит), и что подтверждение получения есть и подтверждает
 * только своё.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");

const SALARY = read("app", "salary.tsx");
const PLAN = read("app", "(tabs)", "plan.tsx");
const PROFILE = read("app", "(tabs)", "profile.tsx");
const API = read("src", "api.ts");

/**
 * Убрать комментарии.
 *
 * Иначе УПОМИНАНИЕ считается кодом. Поймано здесь же: разбор рядом с правкой
 * называет прежнее выражение `kpi.salary`, и страж, ищущий его в файле,
 * находил объяснение вместо ошибки — то есть падал на верной правке.
 *
 * Ровно эта стража стражи уже понадобилась на сервере
 * (api/__tests__/api-surface-is-reachable.test.ts).
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PLAN_CODE = stripComments(PLAN);

/**
 * Утверждение с объяснением.
 *
 * У Jest `expect` принимает ровно один аргумент — второй он считает ошибкой
 * вызова и валит проверку с «Expect takes at most one argument», то есть
 * страж падает не на том, что стережёт. В наборе так и принято: бросать с
 * текстом, по которому видно, ЧТО сломалось.
 */
function must(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}

describe("число берётся у своей ручки", () => {
  test("экран плана больше не ждёт зарплату от kpi.agentKpi", () => {
    /*
      Ровно та ошибка, ради которой этот файл. `kpi.salary` — отдельная ручка,
      и агентский KPI её никогда не отдавал: условие `kpi.salary &&` было
      всегда ложным.
    */
    expect(PLAN_CODE).not.toContain("kpi.salary");
    must(PLAN.includes('getMySalary("month")'), "зарплата не запрашивается вовсе");
  });

  test("в api есть все три вызова", () => {
    expect(API).toContain('trpcQuery<MySalary>("kpi.salary"');
    expect(API).toContain('trpcQuery<MyPayout[]>("kpi.myPayouts"');
    expect(API).toContain('trpcMutation("kpi.confirmPayout"');
  });

  test("отказ по зарплате не роняет экран плана", () => {
    // У кого зарплата не настроена, строки просто не будет: показывать ошибку
    // на экране плана незачем — он не про деньги.
    const at = PLAN.indexOf('queryKey: ["mySalary"');
    must(at > 0, "запрос зарплаты на экране плана не найден");
    const block = PLAN.slice(at, PLAN.indexOf("});", at));
    must(block.includes(".catch(() => null)"), "отказ по зарплате не погашен");
  });
});

describe("сумма разложена, а не показана одним числом", () => {
  test("видно оклад, и у курьера — доставки с суточными", () => {
    /*
      Человек, получающий деньги, должен пересчитать их в уме, иначе спор «мне
      недоплатили» разрешать нечем. Курьерские строки — школьным умножением:
      «12 × 15 000», а не «180 000».
    */
    expect(SALARY).toContain('label="Оклад"');
    expect(SALARY).toContain('label="Обед и дорожные"');
    expect(SALARY).toContain("salary.workDays");
    must(SALARY.includes("`${salary.deliveredCount} × ${formatMoney(salary.deliveryRate)}`"),
      "оплата за доставки показана без расчёта");
  });

  test("проценты по товарам объясняют расхождение", () => {
    /*
      Как только у товаров появляются свои проценты, «продажи × процент»
      перестаёт сходиться с суммой. Показать выдуманное умножение хуже, чем
      сказать, что произошло: человек читает расхождение как ошибку расчёта.
    */
    expect(SALARY).toContain("salary.productRateCount > 0");
    expect(SALARY).toContain("товарам свой процент");
  });

  test("у курьера нет агентских слагаемых, у агента — курьерских", () => {
    // У курьера комиссия и премия нули по определению, у агента нет ни
    // доставок, ни рабочих дней. Показать чужое значило бы объяснять человеку
    // строки, которых у него не бывает.
    const at = SALARY.indexOf("{isCourier ? (");
    must(at > 0, "разделения на курьера и агента нет");
    const courierBranch = SALARY.slice(at, SALARY.indexOf(") : (", at));
    const agentBranch = SALARY.slice(SALARY.indexOf(") : (", at), SALARY.indexOf("</>\n              )}", at));
    must(!courierBranch.includes('label="Комиссия"'), "курьеру показали комиссию");
    must(!agentBranch.includes('label="Обед и дорожные"'), "агенту показали обед и дорожные");
  });
});

describe("подтверждение получения", () => {
  test("кнопка есть и она про получение", () => {
    expect(SALARY).toContain("confirm.mutate(p.id)");
    expect(SALARY).toContain("Получил");
  });

  test("подтверждённое не предлагают подтвердить снова", () => {
    // Время первого подтверждения и есть ответ на «когда он подтвердил»:
    // второе нажатие переписало бы его. Сервер это тоже не даёт, но кнопка,
    // которая ничего не делает, — обещание, которого экран не выполняет.
    expect(SALARY).toContain("const confirmed = Boolean(payout.confirmedAt)");
    expect(SALARY).toContain("{confirmed ? (");
  });

  test("«не подтверждено» показано спокойно, без тревоги", () => {
    /*
      Пусто — это «ещё не подтвердил», а не «не получил»: деньги могли отдать
      в руки, а телефон человек откроет вечером. Красным это красить не за что.
    */
    const at = SALARY.indexOf("function PayoutRow");
    const body = SALARY.slice(at);
    must(!body.includes("status.danger"), "неподтверждённая выдача покрашена тревожно");
  });

  test("аванс отличим от полного расчёта", () => {
    // Показать аванс как выплату значило бы закрыть месяц, который ещё не
    // закрыт.
    expect(SALARY).toContain('payout.kind === "advance"');
  });
});

describe("до экрана можно дойти", () => {
  test("ссылка есть в профиле у агента и у курьера", () => {
    /*
      Ручка без вызова — это функция, которой нет. Тот же разбор, что и на
      сервере: экран, до которого нельзя дойти, ничем не лучше.
    */
    expect(PROFILE).toContain('router.push("/salary")');
    expect(PROFILE).toContain("(isAgent || isCourier)");
  });

  test("и с экрана плана, где стоит сама сумма", () => {
    expect(PLAN).toContain('router.push("/salary")');
  });

  test("экран заявлен в навигации со своей шапкой", () => {
    /*
      Незаявленный экран Expo Router открывает с системной шапкой — а у этого
      своя, и заголовков оказалось бы два друг над другом. Так уже устроены
      все соседние экраны, и выпасть из этого правила легко: файл достаточно
      просто создать.
    */
    const LAYOUT = read("app", "_layout.tsx");
    must(LAYOUT.includes('<Stack.Screen name="salary"'), "экран зарплаты не заявлен в навигации");
    const at = LAYOUT.indexOf('<Stack.Screen name="salary"');
    must(LAYOUT.slice(at, LAYOUT.indexOf("/>", at)).includes("headerShown: false"),
      "у экрана зарплаты две шапки: своя и системная");
  });

  test("начальству ссылки нет", () => {
    // У директора и супервайзера для этого есть ведомость всей команды, и
    // собственная строка в ней видна. Второй путь к тому же ответу разойдётся
    // с первым.
    const at = PROFILE.indexOf('router.push("/salary")');
    const around = PROFILE.slice(Math.max(0, at - 1200), at);
    must(!around.includes("isSupervisor"), "ссылка на зарплату открыта начальству");
  });
});
