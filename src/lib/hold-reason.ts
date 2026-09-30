/*
  Перевод причины удержания заказа — та же логика, что holdReasonText в
  contracts/hold-reason.ts веба.

  Сервер хранит причину по-русски (её читают Telegram и уже выпущенные
  телефоны) и отдаёт её в ответе order.create как holdReason: «Скидка N%
  выше порога M% для полевых сотрудников» и/или «Просроченный долг: …,
  самый старый — N дн.», части через «; ». Узбекский экран переводит
  известные части по шаблону, незнакомые оставляет как есть. Меняются
  шаблоны на сервере — этот файл правится тем же заходом, иначе узбекский
  агент увидит русскую строку (не ошибку — просто без перевода).
*/
const OVERDUE = /^Просроченный долг: (.+), самый старый — (\d+) дн\.$/;
const DISCOUNT = /^Скидка (\S+)% выше порога (\S+)% для полевых сотрудников$/;

function onePart(part: string, lang: string): string {
  if (lang !== "uz") return part;
  const o = OVERDUE.exec(part);
  if (o) return `Muddati o'tgan qarz: ${o[1]}, eng eskisi — ${o[2]} kun`;
  const d = DISCOUNT.exec(part);
  if (d) return `Chegirma ${d[1]}% dala xodimlari uchun ${d[2]}% chegaradan yuqori`;
  return part;
}

export function holdReasonText(reason: string | null | undefined, lang: string): string {
  if (!reason) return "";
  return reason.split("; ").map(p => onePart(p, lang)).join("; ");
}

/** Сообщение агенту после отправки удержанного заказа; t — перевод экрана. */
export function heldNotice(reason: string | null | undefined, t: (ru: string, uz: string) => string): string {
  // Старый сервер причину не присылал, а держал заказ только за скидку.
  if (!reason) return t("Заказ оформлен и ждёт подтверждения офиса — скидка выше порога", "Buyurtma rasmiylashtirildi va ofis tasdig'ini kutmoqda — chegirma chegaradan yuqori");
  return t(`Заказ оформлен и ждёт подтверждения офиса — ${holdReasonText(reason, "ru")}`, `Buyurtma rasmiylashtirildi va ofis tasdig'ini kutmoqda — ${holdReasonText(reason, "uz")}`);
}
