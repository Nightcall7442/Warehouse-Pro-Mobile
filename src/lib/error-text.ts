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
 *
 * ── Слова сервера — только написанные для человека ──────────────────────────
 *
 * Не все слова сервера русские. Отказ по роли и по входу middleware пишет
 * по-английски («Insufficient permissions», «Authentication required»), и
 * агент, открывший экран супервайзера, читал «Не загрузилось · Insufficient
 * permissions» (снимки для App Store, 03.10.2026). Поэтому текст сервера
 * проходит, только если в нём есть кириллица; английский отказ называется
 * по коду ответа — «нет доступа», «сессия закончилась», «не найдено».
 */

import { tt } from "../i18n";

interface MaybeAxios {
  response?: { status?: number; data?: { message?: string; error?: { message?: string; json?: { message?: string; data?: { code?: string } } } } };
  trpcMessage?: string;
  trpcData?: { code?: string };
  message?: string;
  code?: string;
  forHumans?: boolean;
  config?: { url?: string };
}

// Функции, а не константы: язык выбирают на телефоне, и текст должен
// браться в момент отказа, а не при загрузке модуля.
const NO_CONNECTION = () => tt("Нет связи с сервером. Проверьте интернет и попробуйте снова.", "Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.");
const TOO_LONG = () => tt("Сервер не ответил вовремя. Попробуйте ещё раз.", "Server o'z vaqtida javob bermadi. Qayta urinib ko'ring.");
const SERVER_BUSY = () => tt("Сервер сейчас недоступен. Попробуйте через минуту.", "Server hozir ishlamayapti. Bir daqiqadan so'ng urinib ko'ring.");
const UNKNOWN = () => tt("Не получилось. Попробуйте ещё раз.", "Bo'lmadi. Qayta urinib ko'ring.");
const NO_ACCESS = () => tt("Нет доступа: у вашей роли нет прав на это.", "Ruxsat yo'q: rolingizda bunga huquq yo'q.");
const SESSION_OVER = () => tt("Сессия закончилась. Войдите снова.", "Sessiya tugadi. Qaytadan kiring.");
const WRONG_PASSWORD = () => tt("Текущий пароль не подошёл.", "Joriy parol mos kelmadi.");
const NOT_FOUND = () => tt("Не найдено — возможно, уже удалено.", "Topilmadi — ehtimol, o'chirilgan.");
const TOO_MANY = () => tt("Слишком много попыток. Попробуйте позже.", "Urinishlar juda ko'p. Keyinroq urinib ko'ring.");

/** Код отказа tRPC — он же HTTP-статус, если статуса нет. */
const STATUS_OF_CODE: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, TOO_MANY_REQUESTS: 429 };

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
  const raw = typeof err.message === "string" ? err.message : "";

  // Уже сказано для человека: humanError или отказ сервера, переведённый в api.ts.
  if (raw && err.forHumans) return raw;

  // Слова сервера — если они написаны для человека (см. шапку файла).
  const data = err.response?.data;
  const fromServer = data?.error?.message ?? data?.message ?? data?.error?.json?.message ?? err.trpcMessage;
  if (typeof fromServer === "string" && forHumans(fromServer)) return fromServer;

  const code = err.trpcData?.code ?? data?.error?.json?.data?.code;
  const status = err.response?.status ?? (code ? STATUS_OF_CODE[code] : undefined);
  if (typeof status === "number") {
    // 401 смены пароля — «не тот пароль», а не конец сессии (см. isSelfInflicted401 в api.ts).
    if (status === 401) return String(err.config?.url ?? "").includes("user.changePassword") ? WRONG_PASSWORD() : SESSION_OVER();
    if (status === 403) return NO_ACCESS();
    if (status === 404) return NOT_FOUND();
    if (status === 408) return TOO_LONG();
    if (status === 429) return TOO_MANY();
    // С конвертом tRPC сервер ответил сам — «недоступен» было бы неправдой.
    if (status >= 500) return fromServer ? UNKNOWN() : SERVER_BUSY();
  }

  // Ответа не было вовсе: запрос не доехал, и решать было нечему.
  if (!err.response) {
    const low = raw.toLowerCase();
    if (low.includes("timeout") || err.code === "ECONNABORTED") return TOO_LONG();
    if (low.includes("network") || low.includes("failed to fetch") || err.code === "ERR_NETWORK") return NO_CONNECTION();
  }

  // Наше собственное русское сообщение (например, из подготовки фото).
  if (raw && forHumans(raw)) return raw;

  return UNKNOWN();
}
