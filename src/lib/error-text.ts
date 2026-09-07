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

interface MaybeAxios {
  response?: { status?: number; data?: { message?: string; error?: { message?: string } } };
  trpcMessage?: string;
  message?: string;
  code?: string;
}

const NO_CONNECTION = "Нет связи с сервером. Проверьте интернет и попробуйте снова.";
const TOO_LONG = "Сервер не ответил вовремя. Попробуйте ещё раз.";
const SERVER_BUSY = "Сервер сейчас недоступен. Попробуйте через минуту.";
const UNKNOWN = "Не получилось. Попробуйте ещё раз.";

/** В строке есть кириллица — значит её писали для человека, а не для журнала. */
function forHumans(text: string): boolean {
  return /[а-яё]/i.test(text);
}

export function errorText(e: unknown): string {
  const err = (e ?? {}) as MaybeAxios;

  // Слова сервера — они уже написаны для человека.
  const fromServer = err.response?.data?.error?.message ?? err.response?.data?.message ?? err.trpcMessage;
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer;

  const status = err.response?.status;
  if (typeof status === "number") {
    if (status === 408) return TOO_LONG;
    if (status >= 500) return SERVER_BUSY;
  }

  const raw = typeof err.message === "string" ? err.message : "";

  // Ответа не было вовсе: запрос не доехал, и решать было нечему.
  if (!err.response) {
    const low = raw.toLowerCase();
    if (low.includes("timeout") || err.code === "ECONNABORTED") return TOO_LONG;
    if (low.includes("network") || low.includes("failed to fetch") || err.code === "ERR_NETWORK") return NO_CONNECTION;
  }

  // Наше собственное русское сообщение (например, из подготовки фото).
  if (raw && forHumans(raw)) return raw;

  return UNKNOWN;
}
