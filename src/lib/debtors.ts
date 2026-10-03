import type { AgeBucket, ReceivablesAging, ShopAging } from "../api";

/* ═══════════════════════════════════════════════════════════════════════════
   Долги магазинов: отбор, порядок и итоги.

   ── Почему отдельным файлом ─────────────────────────────────────────────────

   Потому что здесь решается, КОГО супервайзер увидит наверху списка, а это
   решение про деньги: полугодовой долг маленькой точки не должен уезжать вниз
   из-за крупного магазина, который просто много берёт и платит исправно.
   Проверять такое надо числами, а не глазами на собранном APK.

   ── Границы возраста ────────────────────────────────────────────────────────

   7 / 30 / 60 дней — те же, что на сервере (services/receivables.ts), и это
   не совпадение, а требование: разойдись они, человек увидел бы в корзине
   «8–30» сумму, посчитанную по другому правилу.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Подпись парой {ru, uz}: экран выбирает по языку через useLang(). Храповик
 * узбекского ищет t(...) на строке и пару в таблице не видит — отсюда
 * i18n-ignore: перевод стоит рядом, в поле uz.
 */
export const BUCKETS: ReadonlyArray<{ key: AgeBucket; ru: string; uz: string }> = [
  { key: "d0_7",    ru: "до 7 дней",  uz: "7 kungacha" },  // i18n-ignore
  { key: "d8_30",   ru: "8–30 дней",  uz: "8–30 kun" },    // i18n-ignore
  { key: "d31_60",  ru: "31–60 дней", uz: "31–60 kun" },   // i18n-ignore
  { key: "d60plus", ru: "больше 60",  uz: "60 dan ko'p" }, // i18n-ignore
];

/**
 * В какую корзину попадает долг по возрасту самого старого заказа.
 *
 * Возраст неизвестен — самая старая корзина. Это долг, начисленный руками, без
 * заказа: состарить его нечем, а спрятать в «свежие» значило бы убрать с глаз
 * ровно то, за чем стоит присмотреть.
 */
export function bucketOf(oldestDays: number | null): AgeBucket {
  if (oldestDays === null) return "d60plus";
  if (oldestDays <= 7) return "d0_7";
  if (oldestDays <= 30) return "d8_30";
  if (oldestDays <= 60) return "d31_60";
  return "d60plus";
}

export interface DebtorFilter {
  search: string;
  bucket: AgeBucket | null;
  /** По сумме вместо возраста. Возраст — по умолчанию, и это не случайно. */
  byAmount: boolean;
}

/**
 * Отобрать и упорядочить должников.
 *
 * По умолчанию — от самых старых: чем дольше долг висит, тем хуже он
 * собирается. Долг без привязки к заказу (возраст неизвестен) идёт первым по
 * той же причине.
 */
export function sortDebtors(shops: ShopAging[], f: DebtorFilter): ShopAging[] {
  const needle = f.search.trim().toLowerCase();

  const filtered = shops.filter(s => {
    /*
      Не должен — не должник. Сервер отдаёт и магазин с нулевым долгом, если
      по нему висят неоплаченные заказы (долг закрыт возвратом или оплатой без
      заказа), но в счёт должников его не берёт. В списке он стоял строкой
      «0 сум · висит 180 дней» красным — под шапкой «15 магазинов» строк было
      28 (снимки для App Store, 03.10.2026).
    */
    if (!(s.debt > 0)) return false;
    if (f.bucket && bucketOf(s.oldestDays) !== f.bucket) return false;
    if (!needle) return true;
    // Ищем и по магазину, и по агенту: супервайзер спрашивает и «где Нодира»,
    // и «что у Отабека».
    return s.shopName.toLowerCase().includes(needle)
      || (s.agentName ?? "").toLowerCase().includes(needle);
  });

  /*
    Сортируется КОПИЯ, а не данные запроса.

    Строго говоря, копию делает уже `.filter()` выше, и снятие этой развёртки
    дефекта не создаёт — проверено нарочной поломкой, страж на неё промолчал,
    и это честный ответ, а не его слабость. Развёртка остаётся как страховка
    от другого будущего: стоит кому-то убрать отбор и отсортировать `shops`
    напрямую — порядок в кэше запроса перетасуется, и второй экран, читающий
    тот же ключ, получит чужой список без единого следа, откуда он взялся.
    Вот ЭТО страж ловит.
  */
  return [...filtered].sort((a, b) => {
    if (f.byAmount) return b.debt - a.debt;
    // null — «неизвестно когда», и это тревожнее любого числа.
    const ax = a.oldestDays ?? Number.POSITIVE_INFINITY;
    const bx = b.oldestDays ?? Number.POSITIVE_INFINITY;
    if (ax !== bx) return bx - ax;
    // При равном возрасте вперёд идёт больший долг: он дороже стоит.
    return b.debt - a.debt;
  });
}

export interface DebtorTotals {
  totalDebt: number;
  debtorCount: number;
  unattributed: number;
  buckets: Record<AgeBucket, number>;
  /** Старше месяца: то, ради чего супервайзер и открывает экран. */
  overdue: number;
}

const EMPTY: Record<AgeBucket, number> = { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 0 };

/** От свежих к старым: в этом порядке корзины отдают излишек. */
const YOUNG_FIRST: AgeBucket[] = ["d0_7", "d8_30", "d31_60", "d60plus"];

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Корзины, урезанные до долга: сумма корзин не больше того, что должны.
 *
 * ── Почему корзины бывают больше долга ──────────────────────────────────────
 *
 * Сервер (services/receivables.ts) старит НЕОПЛАЧЕННЫЕ ЗАКАЗЫ, а долг берёт с
 * карточки магазина (shops.debt). Долг меньше заказов, когда его закрыло то,
 * что к заказу не привязано: возврат, оплата без заказа. Сервер честно отдаёт
 * эту разницу отрицательным `unattributed` — «корзины + неотнесённое = долг».
 *
 * Экран минус терял: «старше месяца» складывал корзины как есть, и на главной
 * супервайзера стояло «всего 9 949 900 · старше месяца 49 124 220» — часть
 * больше целого (снимки для App Store, 03.10.2026).
 *
 * ── Что снимается и откуда ──────────────────────────────────────────────────
 *
 * Излишек снимается со СВЕЖИХ корзин: какой заказ закрыла оплата без заказа,
 * неизвестно, и долг лучше показать старше, чем моложе, — первое зовёт
 * разобраться, второе прячет (то же правило, что у сервера). Потолок — долг
 * магазина, как и у просрочки на сервере (shop-debt.ts → overdueDebt).
 */
export function cappedBuckets(buckets: Partial<Record<AgeBucket, number>> | undefined, debt: number): Record<AgeBucket, number> {
  const out: Record<AgeBucket, number> = { ...EMPTY, ...(buckets ?? {}) };
  let excess = YOUNG_FIRST.reduce((s, k) => s + out[k], 0) - Math.max(0, debt);
  for (const k of YOUNG_FIRST) {
    if (excess <= 0) break;
    const cut = Math.min(out[k], excess);
    out[k] = cents(out[k] - cut);
    excess = cents(excess - cut);
  }
  return out;
}

export function debtorTotals(data: ReceivablesAging | undefined): DebtorTotals {
  if (!data) return { totalDebt: 0, debtorCount: 0, unattributed: 0, buckets: { ...EMPTY }, overdue: 0 };
  const totalDebt = data.totalDebt ?? 0;
  const shops = data.shops ?? [];

  /*
    По магазинам, а не по итогу: излишек одного магазина не гасит старый долг
    другого. Без списка (старый ответ) — тем же правилом по итогу.
  */
  const buckets: Record<AgeBucket, number> = { ...EMPTY };
  if (shops.length > 0) {
    for (const s of shops) {
      const c = cappedBuckets(s.buckets, s.debt);
      for (const k of YOUNG_FIRST) buckets[k] = cents(buckets[k] + c[k]);
    }
  } else {
    Object.assign(buckets, cappedBuckets(data.buckets, totalDebt));
  }
  const attributed = YOUNG_FIRST.reduce((s, k) => s + buckets[k], 0);

  return {
    totalDebt,
    debtorCount: data.debtorCount ?? 0,
    // Остаток до итога: корзины плюс он дают ровно долг, и он не бывает минусом.
    unattributed: cents(Math.max(0, totalDebt - attributed)),
    buckets,
    /*
      Просроченным считаем старше месяца — это тот срок, после которого агент
      едет разговаривать (то же правило, что и на сервере). Долг без привязки
      к заказу сюда НЕ входит: он может быть и вчерашним, и назвать его
      просроченным значило бы придумать.
    */
    overdue: cents(buckets.d31_60 + buckets.d60plus),
  };
}
