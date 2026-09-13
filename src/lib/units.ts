/**
 * Единицы измерения — один список на всё приложение.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Таблиц было три, и они разошлись:
 *
 *   src/components/order/OrderItems.tsx    box → «блок»
 *   src/components/order/OrderEditModal    box → «блок»
 *   app/(tabs)/catalog.tsx                 box → «ящ», строки block нет вовсе
 *
 * То есть ящик (`box`) и блок (`block`) в карточке заказа назывались одним
 * словом: агент, сверяя позицию с накладной, различить их не мог. А в каталоге
 * товар в блоках подписывался кодом из базы — «block».
 *
 * Ещё в двух местах перевода не было вовсе. Сканер подписывал «кг» всё, что не
 * «pcs» — то есть пять кодов из семи (литры, метры, ящики, упаковки, блоки):
 * агент наводил камеру на ящик и читал «1 200 сум/кг». А экран доставки
 * печатал курьеру код как есть: «Заказано: 5 box» — и курьер не знал, что
 * пересчитывать.
 *
 * ── Почему две формы ────────────────────────────────────────────────────────
 *
 * Там, где рядом стоит число, «штук» и «упаковка» растягивают строку и мешают
 * читать; «шт» и «упак» — нет. Полные названия идут в выпадающие списки.
 *
 * Значения — те же коды, что отдаёт сервер (`unit` в src/api.ts). Список
 * перенесён из веб-версии, где пять таких же разошедшихся таблиц уже свели в
 * одну; расхождение между вебом и приложением было бы следующей формой той же
 * беды.
 */

// Строки — уже пары ru/uz, выбор языка ниже в unitLabel/unitShort.
import { currentLang } from "../i18n";

export const UNITS = [
  { value: "kg",    ru: "кг",       uz: "kg",       shortRu: "кг",   shortUz: "kg" },   // i18n-ignore: пара ru/uz
  { value: "l",     ru: "литр",     uz: "litr",     shortRu: "л",    shortUz: "l" },    // i18n-ignore: пара ru/uz
  { value: "pcs",   ru: "штук",     uz: "dona",     shortRu: "шт",   shortUz: "dona" }, // i18n-ignore: пара ru/uz
  { value: "box",   ru: "ящик",     uz: "quti",     shortRu: "ящ",   shortUz: "quti" }, // i18n-ignore: пара ru/uz
  { value: "pack",  ru: "упаковка", uz: "pachka",   shortRu: "упак", shortUz: "pach" }, // i18n-ignore: пара ru/uz
  { value: "m",     ru: "метр",     uz: "metr",     shortRu: "м",    shortUz: "m" },    // i18n-ignore: пара ru/uz
  { value: "block", ru: "блок",     uz: "blok",     shortRu: "бл",   shortUz: "blok" }, // i18n-ignore: пара ru/uz
] as const;

/** Единицы, которые принимает сервер. */
export type Unit = (typeof UNITS)[number]["value"];

const BY_VALUE = new Map<string, (typeof UNITS)[number]>(UNITS.map(u => [u.value, u]));

/**
 * Пустое поле — это штуки. Запасным значением в корзине стояло «кг»: товар без
 * единицы подписывался килограммом наугад, и агент называл магазину цену за
 * килограмм там, где она за ящик.
 */
function codeOf(unit: string | null | undefined): string {
  return (unit ?? "").trim() || "pcs";
}

/** Полное название: для выпадающих списков и карточек. Язык — телефона, если не сказан. */
export function unitLabel(unit: string | null | undefined, lang: string = currentLang()): string {
  const code = codeOf(unit);
  const u = BY_VALUE.get(code);
  // Незнакомый код показываем как есть. Молчаливая подмена хуже: по коду видно,
  // что справочник отстал от сервера, а по «кг» — ничего.
  if (!u) return code;
  return lang === "uz" ? u.uz : u.ru;
}

/** Короткое название: для строк, где рядом стоит число. */
export function unitShort(unit: string | null | undefined, lang: string = currentLang()): string {
  const code = codeOf(unit);
  const u = BY_VALUE.get(code);
  if (!u) return code;
  return lang === "uz" ? u.shortUz : u.shortRu;
}

/**
 * Количество рядом с единицей — одним видом на всех экранах.
 *
 * Остаток приходит строкой из колонки decimal(12,2): «150.00», «1250.00».
 * Каталог печатал его через свой помощник, а корзина нового заказа — как есть,
 * и один и тот же товар выглядел «150 шт» на одном экране и «150.00» на
 * соседнем. Плюс сырая строка читается плохо: у штучного товара агент видел
 * копейки, точку вместо запятой и число без разделителя разрядов — «1250.00» с
 * одного взгляда не разобрать.
 *
 * Дробную часть показываем, только когда она есть: у весового товара 1,5 кг —
 * не то же самое, что 1 кг.
 */
export function formatQty(value: number | string | null | undefined): string {
  const num = Number(value);
  // Мусор и пустота — это «0», а не «NaN»: NaN на экране агента не значит
  // ничего, а место рядом с единицей занимает.
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("ru", { maximumFractionDigits: 2 });
}
