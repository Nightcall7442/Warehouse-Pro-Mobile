/**
 * Отказ, сказанный по-русски.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Экраны показывали `e.message` как есть. А как есть — это текст axios:
 * «Network Error», «timeout of 15000ms exceeded», «Request failed with status
 * code 502». Агенту в поле, у которого пропала связь на въезде в кишлак,
 * приложение сообщало об этом по-английски — и на экране входа тоже, где
 * человек ещё даже не начал работать.
 *
 * Сообщения САМОГО сервера при этом русские и полезные: «Недостаточно товара
 * на складе», «Заказ уже завершён». Их подменять нельзя — в них всё дело.
 *
 * ── Правило ─────────────────────────────────────────────────────────────────
 *
 * Сервер ответил и объяснил — показываем его слова. Сервер не ответил вовсе —
 * это про связь, и говорим об этом по-русски. Всё остальное — «не получилось,
 * попробуйте ещё раз»: техническая строка на экране человека в поле не значит
 * ничего, а место занимает.
 */

import { tt } from "../i18n";

interface MaybeAxios {
  response?: { status?: number; data?: { message?: string; error?: { message?: string } } };
  trpcMessage?: string;
  message?: string;
  code?: string;
  forHumans?: boolean;
}

// Функции, а не константы: язык выбирают на телефоне, и текст должен
// браться в момент отказа, а не при загрузке модуля.
const NO_CONNECTION = () => tt("Нет связи с сервером. Проверьте интернет и попробуйте снова.", "Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.");
const TOO_LONG = () => tt("Сервер не ответил вовремя. Попробуйте ещё раз.", "Server o'z vaqtida javob bermadi. Qayta urinib ko'ring.");
const SERVER_BUSY = () => tt("Сервер сейчас недоступен. Попробуйте через минуту.", "Server hozir ishlamayapti. Bir daqiqadan so'ng urinib ko'ring.");
const UNKNOWN = () => tt("Не получилось. Попробуйте ещё раз.", "Bo'lmadi. Qayta urinib ko'ring.");

/** В строке есть кириллица — значит её писали для человека, а не для журнала. */
function forHumans(text: string): boolean {
  return /[а-яё]/i.test(text);
}

/**
 * Наша собственная ошибка с текстом для человека — на любом языке.
 *
 * По кириллице узнаются только русские тексты; узбекский латиницей от строки
 * axios не отличить. Поэтому свои сообщения помечаются явно, и errorText
 * показывает их как есть.
 */
export function humanError(message: string): Error {
  return Object.assign(new Error(message), { forHumans: true });
}

export function errorText(e: unknown): string {
  const err = (e ?? {}) as MaybeAxios;

  // Слова сервера — они уже написаны для человека.
  const fromServer = err.response?.data?.error?.message ?? err.response?.data?.message ?? err.trpcMessage;
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer;

  const status = err.response?.status;
  if (typeof status === "number") {
    if (status === 408) return TOO_LONG();
    if (status >= 500) return SERVER_BUSY();
  }

  const raw = typeof err.message === "string" ? err.message : "";

  // Ответа не было вовсе: запрос не доехал, и решать было нечему.
  if (!err.response) {
    const low = raw.toLowerCase();
    if (low.includes("timeout") || err.code === "ECONNABORTED") return TOO_LONG();
    if (low.includes("network") || low.includes("failed to fetch") || err.code === "ERR_NETWORK") return NO_CONNECTION();
  }

  // Наше собственное сообщение (например, из подготовки фото).
  if (raw && (err.forHumans || forHumans(raw))) return raw;

  return UNKNOWN();
}
