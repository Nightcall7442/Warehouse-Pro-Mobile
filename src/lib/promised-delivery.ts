/* ═══════════════════════════════════════════════════════════════════════════
   Обещанный срок доставки: из чего его собирают и что про него можно сказать.

   ── Почему не календарь ─────────────────────────────────────────────────────

   Календарём это потребовало бы новой родной зависимости, а в этом проекте
   такое решение уже принималось однажды и в ту же сторону (lib/due-date.ts):
   разбираем сами, зависимость не заводим.

   Здесь оно к тому же и удобнее. Агент не выбирает произвольное мгновение —
   он говорит магазину то, что говорят вслух: «завтра утром», «в пятницу к
   обеду». Два ряда кнопок — день и время — это один-два касания большим
   пальцем, а колесо календаря на телефоне их три и с прицеливанием.

   Горизонт — неделя. Дальше недели поставки напитков не обещают, а если
   когда-нибудь понадобится, календарь отсюда в одну зависимость.

   ── Чего здесь принципиально нет ────────────────────────────────────────────

   Значения по умолчанию. Пустой срок значит «не обещали», и это законный
   ответ: подставленный срок стал бы обещанием от лица агента, а потом —
   срывом, которого не было.
   ═══════════════════════════════════════════════════════════════════════════ */

import { currentLang, type Lang } from "../i18n";

/** Один день в выборе: чем подписан и на какую дату указывает. */
export interface DayChoice {
  /** Ключ и он же значение: «2026-09-11». */
  date: string;
  /** Подпись человеку: «Сегодня», «Завтра», «Пт 12». */
  label: string;
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]; // i18n-ignore: пара — WEEKDAYS_UZ
const WEEKDAYS_UZ = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

/**
 * Пара по ЯВНОМУ языку, а не по текущему: экран передаёт язык параметром,
 * чтобы пересчитать подписи при его смене, а проверки — чтобы не зависеть от
 * телефона.
 */
const pick = (lang: Lang) => (ru: string, uz: string) => (lang === "uz" ? uz : ru);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Ближайшая неделя, начиная с сегодня.
 *
 * Дни складываются по КОМПОНЕНТЕ даты, а не прибавкой суток в миллисекундах:
 * в поясе с переводом часов вторая даёт 23:00 предыдущего дня. Здесь часы не
 * переводят, так что разницы сейчас нет, — но и повода писать хрупкое тоже.
 *
 * `now` параметром: иначе «сегодня» в проверке зависело бы от того, в какой
 * день её запустили.
 */
export function dayChoices(now: Date = new Date(), count = 7, lang: Lang = currentLang()): DayChoice[] {
  const t = pick(lang);
  const out: DayChoice[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? t("Сегодня", "Bugun") : i === 1 ? t("Завтра", "Ertaga")
      : `${(lang === "uz" ? WEEKDAYS_UZ : WEEKDAYS)[d.getDay()]} ${d.getDate()}`;
    out.push({ date: iso(d), label });
  }
  return out;
}

/** Часы, которыми называют время доставки. Названы, а не набираются. */
export const TIME_CHOICES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"] as const;

/**
 * День и время → мгновение.
 *
 * Собирается через конструктор Date по частям, а не разбором строки: строка
 * «2026-09-11T13:00» на iOS читается как UTC, и обещание уезжало бы на пять
 * часов назад. Здесь части всегда местные — те самые, что человек выбрал.
 */
export function combineLocal(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  const made = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0);
  return Number.isNaN(made.getTime()) ? null : made;
}

/** Мгновение → пара (день, время), чтобы показать выбранным то, что стоит. */
export function splitLocal(v: Date | string | null | undefined): { date: string; time: string } | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: iso(d), time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** Как показать обещание человеку: «Завтра, 13:00» или «12 сентября, 13:00». */
const MONTHS = [ // i18n-ignore: пара — MONTHS_UZ
  "января", "февраля", "марта", "апреля", "мая", "июня", // i18n-ignore: пара — MONTHS_UZ
  "июля", "августа", "сентября", "октября", "ноября", "декабря", // i18n-ignore: пара — MONTHS_UZ
];
const MONTHS_UZ = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

export function formatPromise(v: Date | string | null | undefined, now: Date = new Date(), lang: Lang = currentLang()): string {
  const t = pick(lang);
  const d = v instanceof Date ? v : v == null ? null : new Date(v);
  if (!d || Number.isNaN(d.getTime())) return t("Срок не называли", "Muddat aytilmagan");
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
  );
  if (days === 0) return t(`Сегодня, ${time}`, `Bugun, ${time}`);
  if (days === 1) return t(`Завтра, ${time}`, `Ertaga, ${time}`);
  if (days === -1) return t(`Вчера, ${time}`, `Kecha, ${time}`);
  return `${d.getDate()} ${(lang === "uz" ? MONTHS_UZ : MONTHS)[d.getMonth()]}, ${time}`;
}

export type PromiseState =
  /** Срок не называли. Вывода о просрочке быть не может. */
  | { kind: "none" }
  /** Срок назвали, время ещё не вышло. */
  | { kind: "due"; lateMs: 0 }
  /** Заказ в работе, а срок уже прошёл. */
  | { kind: "late"; lateMs: number }
  /** Довезли, и довезли вовремя. */
  | { kind: "on_time"; lateMs: 0 }
  /** Довезли, но позже обещанного. */
  | { kind: "late_delivered"; lateMs: number }
  /** Отменён или возвращён — обещание больше ни о чём не говорит. */
  | { kind: "closed" };

/**
 * Что можно сказать про обещание.
 *
 * `now` параметром, а не Date.now() внутри: иначе «просрочен» проверялся бы
 * только ожиданием, а поведение на границе — никак.
 */
export function promiseState(
  promised: Date | string | null | undefined,
  status: string,
  deliveredAt?: Date | string | null,
  now: Date = new Date(),
): PromiseState {
  if (promised == null) return { kind: "none" };
  const due = promised instanceof Date ? promised : new Date(promised);
  if (Number.isNaN(due.getTime())) return { kind: "none" };

  if (status === "delivered") {
    // Без времени доставки судить не о чем: статус говорит «довезли», а когда
    // именно — неизвестно. Придумывать здесь «вовремя» нельзя.
    if (deliveredAt == null) return { kind: "on_time", lateMs: 0 };
    const got = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt);
    if (Number.isNaN(got.getTime())) return { kind: "on_time", lateMs: 0 };
    const late = got.getTime() - due.getTime();
    return late > 0 ? { kind: "late_delivered", lateMs: late } : { kind: "on_time", lateMs: 0 };
  }

  if (status === "cancelled" || status === "returned") return { kind: "closed" };

  const late = now.getTime() - due.getTime();
  return late > 0 ? { kind: "late", lateMs: late } : { kind: "due", lateMs: 0 };
}

/** Можно ли ещё переносить: по закрытому заказу обещание не переписывают. */
export function canMovePromise(status: string): boolean {
  return status === "new" || status === "processing" || status === "shipped" || status === "pending";
}
