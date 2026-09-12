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

export const BUCKETS: ReadonlyArray<{ key: AgeBucket; label: string }> = [
  { key: "d0_7",    label: "до 7 дней" },
  { key: "d8_30",   label: "8–30 дней" },
  { key: "d31_60",  label: "31–60 дней" },
  { key: "d60plus", label: "больше 60" },
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

export function debtorTotals(data: ReceivablesAging | undefined): DebtorTotals {
  if (!data) return { totalDebt: 0, debtorCount: 0, unattributed: 0, buckets: { ...EMPTY }, overdue: 0 };
  const b = data.buckets ?? EMPTY;
  return {
    totalDebt: data.totalDebt ?? 0,
    debtorCount: data.debtorCount ?? 0,
    unattributed: data.unattributed ?? 0,
    buckets: { ...EMPTY, ...b },
    /*
      Просроченным считаем старше месяца — это тот срок, после которого агент
      едет разговаривать (то же правило, что и на сервере). Долг без привязки
      к заказу сюда НЕ входит: он может быть и вчерашним, и назвать его
      просроченным значило бы придумать.
    */
    overdue: (b.d31_60 ?? 0) + (b.d60plus ?? 0),
  };
}
