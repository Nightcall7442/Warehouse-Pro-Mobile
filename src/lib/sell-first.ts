/**
 * «Продать первым» — уценка по сроку.
 *
 * ── Что это ─────────────────────────────────────────────────────────────────
 *
 * Партия не успевает продаться до срока, директор на вебе ставит ей цену
 * ниже (экран «Сроки», веб #157; сервер — api/services/markdown.ts). Цена
 * уценки — ПОТОЛОК: заказ по товару не дороже её, и сервер уже срезал по ней
 * unitPrice и ступени в product.listAll. Телефону пересчитывать нечего — он
 * должен только СКАЗАТЬ агенту: этот товар предлагать первым, вот цена была,
 * вот стала, и до какого дня.
 *
 * Сервер к товару с действующей уценкой добавляет markdown { price, endsOn };
 * basePrice — цена карточки до уценки. Без уценки markdown null.
 *
 * ── Почему «сегодня» проверяется здесь ──────────────────────────────────────
 *
 * Сервер прошедших уценок не присылает. Но каталог живёт и копией на диске —
 * без связи агент видит вчерашний или недельный список, и уценка, кончившаяся
 * в пятницу, в понедельник звала бы «продать первым» то, что уже по обычной
 * цене. Поэтому уценка считается живой, только пока её последний день не
 * прошёл по часам телефона.
 */

export interface Markdown {
  /** Цена уценки, DECIMAL строкой. */
  price: string;
  /** Последний день уценки, «ГГГГ-ММ-ДД». */
  endsOn: string;
}

type WithMarkdown = { markdown?: Markdown | null };

/** Сегодня по часам телефона, «ГГГГ-ММ-ДД» — так же, как endsOn у сервера. */
export function todayKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Уценка, которая ещё действует; иначе null (нет её, кривая или кончилась). */
export function liveMarkdown(p: WithMarkdown, today: string = todayKey()): Markdown | null {
  const m = p.markdown;
  if (!m || typeof m.endsOn !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(m.endsOn)) return null;
  return m.endsOn.slice(0, 10) >= today ? m : null;
}

/** Сколько товаров «продать первым». */
export function sellFirstCount(list: readonly WithMarkdown[], today: string = todayKey()): number {
  return list.reduce((n, p) => n + (liveMarkdown(p, today) ? 1 : 0), 0);
}

/**
 * Уценённые — в начало, остальной порядок не трогается (как в вебе: Catalog,
 * ProductSelector). Новый массив; исходный не меняется.
 */
export function sellFirstOnTop<T extends WithMarkdown>(list: readonly T[], today: string = todayKey()): T[] {
  const marked: T[] = [];
  const rest: T[] = [];
  for (const p of list) (liveMarkdown(p, today) ? marked : rest).push(p);
  return [...marked, ...rest];
}

/**
 * Цена до уценки — её печатают зачёркнутой рядом с ценой.
 *
 * shown — цена, которую экран показывает (в окне заказа — цена ступени при
 * набранном количестве). Зачёркивать есть что, только если уценка жива и
 * прежняя цена выше показанной: у магазина, которому по прайс-листу и так
 * дешевле уценки, цена не менялась, и «было/стало» было бы враньём.
 */
export function priceBeforeMarkdown(
  p: WithMarkdown & { unitPrice: string; basePrice?: string | number | null },
  shown: string | number = p.unitPrice,
  today: string = todayKey(),
): string | null {
  if (!liveMarkdown(p, today) || p.basePrice == null) return null;
  const before = Number(p.basePrice);
  return Number.isFinite(before) && before > Number(shown) ? String(p.basePrice) : null;
}

/** «12.10» — последний день уценки для подписи. */
export function markdownUntil(m: Markdown): string {
  return `${m.endsOn.slice(8, 10)}.${m.endsOn.slice(5, 7)}`;
}

/**
 * Цена карточки без связи, срезанная потолком уценки.
 *
 * Копия каталога для магазина, которого со связью не открывали, показывает
 * цену карточки (lib/offline-copy). Сервер же любому магазину отдаёт её не
 * выше уценки — без среза окно заказа обещало бы цену дороже той, по
 * которой сервер посчитает заказ.
 */
export function capAtMarkdown(price: string, p: WithMarkdown, today: string = todayKey()): string {
  const m = liveMarkdown(p, today);
  return m && Number(m.price) < Number(price) ? m.price : price;
}
