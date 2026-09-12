/**
 * Обещанный срок доставки.
 *
 * ── Что здесь на самом деле проверяется ─────────────────────────────────────
 *
 * Две вещи, каждая ломается молча и видна только у клиента:
 *
 *   1. Часовой пояс. «2026-09-11T13:00» строкой на iOS читается как UTC — и
 *      обещание уезжает на пять часов назад (Ташкент — UTC+5). Поэтому
 *      мгновение собирается конструктором по частям.
 *
 *   2. Вывод о срыве. «Просрочен», «довезли позже обещанного» и «срок не
 *      называли» — три РАЗНЫХ ответа. Третий обязан оставаться третьим: по
 *      этому полю считают опоздания, и придуманный ответ станет придуманным
 *      срывом.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dayChoices, TIME_CHOICES, combineLocal, splitLocal, formatPromise,
  promiseState, canMovePromise,
} from "../lib/promised-delivery";

/** В Jest у expect один довод — причину пишем сами. */
function must(ok: boolean, why: string) {
  if (!ok) throw new Error(why);
}

describe("выбор дня", () => {
  const now = new Date(2026, 8, 11, 15, 0); // пятница, 11 сентября 2026

  it("начинается с сегодня и идёт неделю", () => {
    const days = dayChoices(now);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-09-11", label: "Сегодня" });
    expect(days[1]).toEqual({ date: "2026-09-12", label: "Завтра" });
    expect(days[2].label).toBe("Вс 13");
  });

  it("перешагивает конец месяца", () => {
    // «30 сентября + 2» — это 2 октября, а не «32 сентября».
    const days = dayChoices(new Date(2026, 8, 30, 10, 0), 3);
    expect(days.map(d => d.date)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("день остаётся тем же, в котором бы ни часу его считали", () => {
    /*
      Поздний вечер — обычное время оформления: агент сдаёт день. Прибавка
      суток в миллисекундах от 23:30 даёт 23:30 следующего дня — тот же
      календарный день, что и сложение по компоненте, ПОКА часы не переводят.
      Здесь их не переводят, поэтому проверка стережёт не это, а то, что
      набор дней не зависит от времени суток.
    */
    const late = dayChoices(new Date(2026, 8, 11, 23, 30), 3).map(d => d.date);
    const early = dayChoices(new Date(2026, 8, 11, 0, 30), 3).map(d => d.date);
    expect(late).toEqual(early);
    expect(late).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });
});

describe("день и время складываются в мгновение", () => {
  it("части остаются местными", () => {
    /*
      Главная проверка. new Date("2026-09-11T13:00") на iOS даёт UTC —
      обещание «к часу дня» уехало бы на восемь утра.
    */
    const made = combineLocal("2026-09-11", "13:00");
    must(made !== null, "не собралось мгновение");
    expect(made!.getFullYear()).toBe(2026);
    expect(made!.getMonth()).toBe(8);
    expect(made!.getDate()).toBe(11);
    expect(made!.getHours()).toBe(13);
    expect(made!.getMinutes()).toBe(0);
  });

  it("туда и обратно — то же самое", () => {
    const made = combineLocal("2026-09-11", "17:00")!;
    expect(splitLocal(made)).toEqual({ date: "2026-09-11", time: "17:00" });
  });

  it("мусор не превращается в дату", () => {
    // Иначе на сервер уехало бы «Invalid Date» и заказ не прошёл бы вовсе.
    expect(combineLocal("завтра", "13:00")).toBeNull();
    expect(combineLocal("2026-09-11", "днём")).toBeNull();
    expect(splitLocal(null)).toBeNull();
    expect(splitLocal("не дата")).toBeNull();
  });

  it("время предлагается рабочими часами", () => {
    expect(TIME_CHOICES.length).toBeGreaterThan(3);
    for (const t of TIME_CHOICES) expect(t).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("как срок читается человеку", () => {
  const now = new Date(2026, 8, 11, 15, 0);

  it("ближние дни называются словами", () => {
    expect(formatPromise(new Date(2026, 8, 11, 13, 0), now)).toBe("Сегодня, 13:00");
    expect(formatPromise(new Date(2026, 8, 12, 9, 0), now)).toBe("Завтра, 09:00");
    expect(formatPromise(new Date(2026, 8, 15, 17, 0), now)).toBe("15 сентября, 17:00");
  });

  it("пусто читается как «не называли», а не как пустая строка", () => {
    // Пустое место на экране агент прочтёт как «сломалось».
    expect(formatPromise(null, now)).toBe("Срок не называли");
    expect(formatPromise("не дата", now)).toBe("Срок не называли");
  });
});

describe("вывод о сроке", () => {
  const due = new Date("2026-09-11T13:00:00Z");
  const before = new Date("2026-09-11T12:00:00Z");
  const after = new Date("2026-09-11T15:00:00Z");

  it("без обещания вывода нет", () => {
    /*
      Правило целиком: не называли срок — сказать про него нечего. Ни «в
      срок», ни «просрочен».
    */
    expect(promiseState(null, "new", null, after).kind).toBe("none");
    expect(promiseState(null, "delivered", after, after).kind).toBe("none");
  });

  it("в работе: до срока ждём, после — просрочен", () => {
    expect(promiseState(due, "shipped", null, before).kind).toBe("due");
    expect(promiseState(due, "shipped", null, after).kind).toBe("late");
  });

  it("ровно в назначенное время ещё не просрочен", () => {
    // Граница принадлежит обещанию: «к 13:00» в 13:00 — выполнено.
    expect(promiseState(due, "new", null, due).kind).toBe("due");
  });

  it("доставленный сравнивается с фактом доставки, а не с «сейчас»", () => {
    // Иначе довезённый вовремя заказ становился бы просроченным назавтра сам
    // по себе, просто оттого, что часы идут.
    const later = new Date("2026-12-31T00:00:00Z");
    expect(promiseState(due, "delivered", before, later).kind).toBe("on_time");
    expect(promiseState(due, "delivered", after, later).kind).toBe("late_delivered");
  });

  it("отменённый и возвращённый закрыты, а не просрочены", () => {
    expect(promiseState(due, "cancelled", null, after).kind).toBe("closed");
    expect(promiseState(due, "returned", null, after).kind).toBe("closed");
  });
});

describe("переносить можно, пока заказ не закрыт", () => {
  it("живые статусы", () => {
    for (const s of ["new", "processing", "shipped", "pending"]) {
      must(canMovePromise(s), `по статусу «${s}» срок обязан переноситься`);
    }
  });

  it("закрытые — нет", () => {
    // Переписать обещание по доставленному значило бы стереть срыв задним
    // числом: на той стороне по этому полю считают опоздания.
    for (const s of ["delivered", "cancelled", "returned"]) {
      must(!canMovePromise(s), `по статусу «${s}» срок менять нельзя`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Правила, которые числами не проверить: они про то, откуда берётся значение.
   ═══════════════════════════════════════════════════════════════════════════ */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const NEW = read("app/order/new.tsx");
const DETAIL = read("app/order/[id].tsx");
const BLOCK = read("src/components/order/PromisedDelivery.tsx");
const API = read("src/api.ts");

describe("срок ставит человек", () => {
  it("оформление не подставляет срок само", () => {
    /*
      Любой new Date() на этом месте — обещание магазину от лица агента,
      которого он не давал, и просрочка, которой не было.
    */
    const at = NEW.indexOf("const [promisedAt, setPromisedAt] = useState");
    must(at > -1, "поле срока пропало из оформления");
    const line = NEW.slice(at, NEW.indexOf("\n", at));
    expect(line).toBe("const [promisedAt, setPromisedAt] = useState<string | null>(null);");
  });

  it("срок доезжает до сервера при оформлении", () => {
    /*
      Поле, которое агент заполнил и которое никуда не поехало, — самый
      дорогой вид поломки: заметно только у клиента и только потом.

      Смотрим ИМЕННО обычную отправку. Раньше проверка искала строку по
      всему файлу и находила её в записи офлайн-очереди: убери поле из
      обычной отправки — страж молчал, потому что подстрока никуда не
      делась. Поймано нарочной поломкой.
    */
    const at = NEW.indexOf("const input = {");
    must(at > -1, "не найдена отправка заказа");
    const input = NEW.slice(at, NEW.indexOf("\n    };", at));
    expect(input).toContain("promisedDeliveryAt: promisedAt ?? undefined");
    expect(API).toContain("promisedDeliveryAt?: string;");
  });

  it("и не теряется, когда связи не было", () => {
    /*
      Очередь без связи отправляет тот же input целиком, и обещание едет с
      ним. Проверяем, что поле положено в запись очереди: агент обещает
      магазину именно тогда, когда стоит в подвале без сети.
    */
    const at = NEW.indexOf("const offlineOrder =");
    must(at > -1, "запись очереди не найдена");
    const line = NEW.slice(at, NEW.indexOf("\n", at));
    expect(line).toContain("promisedDeliveryAt");
  });

  it("перенос идёт своей ручкой, а не общей правкой заказа", () => {
    // order.update открыта только офису и заодно правит скидку с оплатой.
    expect(API).toContain('trpcMutation<void>("order.setPromisedDelivery"');
    expect(DETAIL).toContain("setPromisedDelivery(Number(id), v)");
  });

  it("блок стоит на экране заказа, а не только в вебе", () => {
    // Ровно тот промах, который в этом приложении ловили уже дважды:
    // возможность есть на сервере, а дойти до неё агенту неоткуда.
    const tag = DETAIL.match(/<PromisedDelivery(?![A-Za-z0-9_])/);
    must(tag !== null, "обещанного срока нет на экране заказа");
    const block = DETAIL.slice(tag!.index!, DETAIL.indexOf("/>", tag!.index!));
    expect(block).toContain("value={order.promisedDeliveryAt ?? null}");
    expect(block).toContain("deliveredAt={order.deliveredAt ?? null}");
    expect(block).toContain("editable={canMovePromise(order.status)}");
  });

  it("пустой срок снимает обещание, а не оставляет прежнее", () => {
    // Иначе ошибочно поставленный срок остаётся навсегда — вместе с
    // посчитанной по нему просрочкой.
    expect(BLOCK).toContain("onChange(null)");
    expect(API).toContain("promisedDeliveryAt: string | null");
  });

  it("кнопки выбора не мельче пальца", () => {
    /*
      Правило приложения: цель касания — 44 точки. Ряд узких кнопок в нижней
      части экрана иначе не нажимается на ходу.

      Смотрим ИМЕННО кнопку выбора. По всему файлу проверка проходила и
      после того, как ряд ужали: то же слово стоит у кнопки «Убрать срок»,
      и страж считал её за всех. Поймано нарочной поломкой.
    */
    const at = BLOCK.indexOf("const chip = (active: boolean)");
    must(at > -1, "не найдено оформление кнопки выбора");
    const chipStyle = BLOCK.slice(at, BLOCK.indexOf("});", at));
    expect(chipStyle).toContain("minHeight: Sizes.touchTarget");
  });
});
