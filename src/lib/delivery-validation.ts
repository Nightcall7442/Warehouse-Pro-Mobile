/**
 * Проверка формы «Результат доставки».
 *
 * Вынесена из экрана отдельной функцией, чтобы её можно было проверить: сам
 * экран без навигации, запросов и темы в тесте не поднять, а вся суть поломки
 * была здесь.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Поле «Сумма оплаты» рисуется только для частичной оплаты, а требовалось оно
 * и для полной:
 *
 *     if ((result === "paid" || result === "partial_paid") && Number(paidAmount || 0) <= 0)
 *
 * «Оплачен полностью» — исход по умолчанию и самый частый. Курьер выбирал
 * его, жал «Завершить» и получал «Укажите сумму оплаты», а поля, о котором
 * идёт речь, на экране не было. Завершить доставку было нельзя вообще.
 *
 * При этом сумма для полной оплаты и так берётся из итога заказа, а не из
 * поля. Проверять надо было итог.
 */

import { tt } from "../i18n";

export type DeliveryResult =
  | "paid"
  | "partial_paid"
  | "unpaid"
  | "returned"
  | "partial_returned";

export interface DeliveryFormState {
  result: DeliveryResult;
  /** Строка из поля ввода: пустая, пока курьер ничего не набрал. */
  paidAmount: string;
  orderTotal: number;
  /** Сколько позиций отмечено к возврату. */
  returnedItemsCount: number;
  /** Сумма за то, что осталось у магазина после частичного возврата. */
  keptTotal?: number;
}

/**
 * Что не так с формой, словами для курьера. null — можно отправлять.
 *
 * Порядок проверок — от частого к редкому: первое сообщение и увидит человек.
 */
export function validateDeliveryForm(form: DeliveryFormState): string | null {
  const paid = Number(form.paidAmount || 0);

  if (form.result === "partial_paid") {
    if (!(paid > 0)) return tt("Укажите сумму оплаты", "To'lov summasini kiriting");
    // Равная итогу сумма — это полная оплата, а не частичная. Пропустив её
    // сюда, получим заказ с долгом в ноль и пометкой «оплачен частично».
    if (paid >= form.orderTotal) return tt("При частичной оплате сумма должна быть меньше итого", "Qisman to'lovda summa jamidan kam bo'lishi kerak");
  }

  // Полная оплата нулевого заказа бессмысленна: платить не за что, а отметка
  // «оплачен» закроет долг, которого не было.
  if (form.result === "paid" && !(form.orderTotal > 0)) {
    return tt("У заказа нулевая сумма — отметьте «не оплачен»", "Buyurtma summasi nol — «to'lanmagan» deb belgilang");
  }

  if (form.result === "partial_returned" && form.returnedItemsCount === 0) {
    return tt("Укажите возвращённое количество хотя бы одного товара", "Kamida bitta tovarning qaytarilgan miqdorini kiriting");
  }
  /*
    Частичный возврат идёт вместе с деньгами: «привёз 10, 2 вернули, за 8
    заплатили» — самый обычный случай дня. Раньше сумму при возврате нельзя
    было указать вовсе: всё оставшееся ложилось магазину в долг, а наличные
    у курьера в системе не существовали. Ноль — тоже ответ (всё в долг).
  */
  if (form.result === "partial_returned" && form.keptTotal !== undefined && paid > form.keptTotal + 0.005) {
    const kept = form.keptTotal.toLocaleString("ru");
    return tt(`Оплата больше суммы за оставшийся товар (${kept})`, `To'lov qolgan tovar summasidan ko'p (${kept})`);
  }

  return null;
}
