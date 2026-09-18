/**
 * Деньги заказа — в одном месте.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Формула суммы строки была выписана в app/order/new.tsx ЧЕТЫРЕ раза:
 *
 *     l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100)
 *
 * — в корзине, в подсчёте итога, в списке проверки и, без скидки, в зачёркнутой
 * цене. Четыре копии одной формулы расходятся не «когда-нибудь», а на первой же
 * правке: поправят скидку в корзине, а итог посчитается по-старому, и агент
 * увидит одну сумму на экране товара и другую на экране подтверждения.
 *
 * ── Что чинится заодно ──────────────────────────────────────────────────────
 *
 * Скидка не ограничивалась ничем. Агент набирает «150» вместо «15» — множитель
 * становится −0.5, и строка уходит в МИНУС, уменьшая общий счёт. Заказ на
 * такую сумму уезжает на сервер: экран показывает то, что посчитал.
 *
 * Количество читалось через Number() напрямую. На цифровой клавиатуре легко
 * набрать одну точку, и Number(".") — это NaN. Одна точка в одной строке
 * превращала и её сумму, и ИТОГО в «NaN»: экран переставал показывать деньги
 * вовсе, а понять почему нельзя.
 *
 * Отрицательное количество Number() тоже принимает: минус на цифровой
 * клавиатуре есть.
 */

export interface MoneyLine {
  unitPrice: number;
  /** Поле ввода, поэтому строка: «2.5», «», «.», «-3». */
  quantity: string | number;
  /** Проценты, 0–100. */
  discount?: string | number;
}

/**
 * Число из поля ввода.
 *
 * Пустое поле, одна точка и мусор — это ноль, а не NaN: на экране агента NaN
 * не значит ничего, а ноль честно показывает, что строка ещё не заполнена.
 * Отрицательные не пропускаем — ни количества, ни скидки со знаком минус не
 * бывает.
 */
export function parseAmount(value: string | number | null | undefined): number {
  // Запятая — десятичный знак, пробелы (и неразрывные) — разряды: «1 500,50».
  const num = typeof value === "number" ? value : Number(String(value ?? "").replace(/[\s\u00a0]/g, "").replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

/**
 * Количество из поля ввода, зажатое остатком.
 *
 * Раньше поле возврата пересчитывалось на каждом нажатии выражением
 * `String(Math.max(0, Math.min(max, Number(v) || 0)))` и тут же переписывало
 * само себя. Набранная точка исчезала на лету: «1.» → 1 → «1», и дробное
 * количество ввести было нельзя вовсе, а запятая обнуляла поле. Полкило
 * весового товара уходило в недостачу склада, а не в возврат магазина.
 *
 * Разбор строки и ограничение остатком — разные дела: строку хранит поле,
 * число получается отсюда и только при отправке.
 */
export function clampQty(value: string | number | null | undefined, max: number): number {
  return Math.min(max, parseAmount(value));
}

/** Скидка в процентах, зажатая в 0–100: строка заказа не может стоить меньше нуля. */
export function clampDiscount(value: string | number | null | undefined): number {
  return Math.min(100, parseAmount(value));
}

/** Сумма строки со скидкой. */
export function lineTotal(line: MoneyLine): number {
  return line.unitPrice * parseAmount(line.quantity) * (1 - clampDiscount(line.discount) / 100);
}

/** Сумма строки до скидки — та самая зачёркнутая цена. */
export function lineTotalBeforeDiscount(line: MoneyLine): number {
  return line.unitPrice * parseAmount(line.quantity);
}

/** Итог заказа: сумма и количество единиц. */
export function orderTotals(lines: MoneyLine[]): { subtotal: number; totalQty: number } {
  let subtotal = 0;
  let totalQty = 0;
  for (const line of lines) {
    subtotal += lineTotal(line);
    totalQty += parseAmount(line.quantity);
  }
  return { subtotal, totalQty };
}

/**
 * Сумма заказа, который ещё лежит в очереди на телефоне.
 *
 * Было: в списке заказов отложенный заказ значился только счётчиком «1 не
 * отправлен» — ни магазина, ни суммы, ни времени. Названная владельцу
 * сумма (quotedTotal) в записи есть; у записей, сделанных до её появления,
 * считается по строкам — так же, как считалась на экране оформления.
 */
export function offlineOrderTotal(o: { quotedTotal?: number; input: { items: MoneyLine[] } }): number {
  return o.quotedTotal ?? orderTotals(o.input.items).subtotal;
}
