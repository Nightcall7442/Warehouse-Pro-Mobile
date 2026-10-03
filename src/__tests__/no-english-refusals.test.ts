/**
 * Английский отказ сервера на экран не выходит.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Снимки для App Store, 03.10.2026: агент на /debtors видел «Не загрузилось ·
 * Insufficient permissions». errorText пропускал слова сервера как есть —
 * считая их всегда русскими, — а middleware отказывает по роли и по входу
 * по-английски («Insufficient permissions», «Authentication required»). Мимо
 * errorText тот же текст шёл через e.message: обёртка trpcMutation подставляла
 * в ошибку слова сервера, и экраны печатают её в notify.error как есть.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 *   · русские слова сервера проходят без изменений — в них всё дело;
 *   · английские заменяются по коду ответа: нет доступа, сессия, пароль,
 *     не найдено, слишком часто;
 *   · ошибка из trpcMutation уже несёт русский текст в message.
 *
 * Нарочные поломки: вернуть в errorText проверку «непустая строка» вместо
 * forHumans — падают первые два блока; вернуть в api.ts new Error(e.trpcMessage)
 * — падает последний.
 */
jest.mock("axios", () => ({
  create: jest.fn(() => ({
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  })),
}));
jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() },
}));

import { describe, it, expect } from "@jest/globals";
import { errorText } from "../lib/error-text";

/** Ошибка axios с конвертом tRPC — как её отдаёт перехватчик api.ts. */
function refusal(status: number, message: string, code: string, url = "/shop.receivablesAging") {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { json: { message, code: -32603, data: { code, httpStatus: status } } } } },
    trpcMessage: message,
    trpcData: { code, httpStatus: status },
    config: { url },
  });
}

/** Ни одного латинского слова: узбекского здесь нет, язык по умолчанию — русский. */
const noEnglish = (s: string) => expect(s).not.toMatch(/[A-Za-z]{3}/);

describe("русские слова сервера — как есть", () => {
  it("отказ по существу печатается словами сервера, и при 500 тоже", () => {
    expect(errorText(refusal(400, "Недостаточно товара на складе", "BAD_REQUEST"))).toBe("Недостаточно товара на складе");
    // Обычный throw new Error(...) tRPC отдаёт пятисоткой — слова те же.
    expect(errorText(refusal(500, "Заказ уже завершён", "INTERNAL_SERVER_ERROR"))).toBe("Заказ уже завершён");
  });
});

describe("английский отказ называется по коду", () => {
  it("нет прав — «нет доступа», а не «Insufficient permissions»", () => {
    const out = errorText(refusal(403, "Insufficient permissions", "FORBIDDEN"));
    expect(out).toMatch(/^Нет доступа/);
    noEnglish(out);
  });

  it("код без статуса тоже узнаётся", () => {
    expect(errorText({ trpcMessage: "Insufficient permissions", trpcData: { code: "FORBIDDEN" } })).toMatch(/^Нет доступа/);
  });

  it("не вошёл — «сессия закончилась»; не тот пароль при смене — так и сказано", () => {
    expect(errorText(refusal(401, "Authentication required", "UNAUTHORIZED"))).toMatch(/Сессия закончилась/);
    const pwd = errorText(refusal(401, "Current password is incorrect.", "UNAUTHORIZED", "/user.changePassword"));
    expect(pwd).toMatch(/пароль не подошёл/);
    noEnglish(pwd);
  });

  it("не найдено, слишком часто и прочее английское — по-русски", () => {
    for (const out of [
      errorText(refusal(404, "User not found.", "NOT_FOUND")),
      errorText(refusal(429, "Too many attempts. Try again in 15 minutes.", "TOO_MANY_REQUESTS")),
      errorText(refusal(409, "Email already in use in this organization.", "CONFLICT")),
      // Сервер ответил сам — «сервер недоступен» было бы неправдой.
      errorText(refusal(500, "Unable to generate unique slug.", "INTERNAL_SERVER_ERROR")),
    ]) noEnglish(out);
    expect(errorText(refusal(500, "Unable to generate unique slug.", "INTERNAL_SERVER_ERROR"))).toBe("Не получилось. Попробуйте ещё раз.");
  });
});

describe("e.message из trpcMutation — уже для человека", () => {
  it("отказ по роли приходит в message по-русски, со знаком «сервер решил»", async () => {
    const axios = require("axios");
    const { addOrderComment } = require("../api") as typeof import("../api");
    const http = axios.create.mock.results[0].value;
    http.post.mockRejectedValueOnce(refusal(403, "Insufficient permissions", "FORBIDDEN", "/order.addComment"));

    const err = await addOrderComment(1, "привет").then(() => null, (e: unknown) => e as Error & { serverRejected?: boolean });
    expect(err).toBeTruthy();
    expect(err!.message).toMatch(/^Нет доступа/);
    noEnglish(err!.message);
    expect(err!.serverRejected).toBe(true);
    // Повторный проход через errorText ничего не портит.
    expect(errorText(err)).toBe(err!.message);
  });

  it("русские слова сервера в message — без изменений", async () => {
    const axios = require("axios");
    const { addOrderComment } = require("../api") as typeof import("../api");
    const http = axios.create.mock.results[0].value;
    http.post.mockRejectedValueOnce(refusal(500, "Заказ уже завершён", "INTERNAL_SERVER_ERROR", "/order.addComment"));

    const err = await addOrderComment(1, "привет").then(() => null, (e: unknown) => e as Error);
    expect(err!.message).toBe("Заказ уже завершён");
  });
});

describe("экраны не печатают error.message запроса как есть", () => {
  /*
    У GET-запроса message — строка axios («Request failed with status code
    403»): обёртки, как у trpcMutation, у него нет. Отказ запроса на экране —
    только через errorText или ErrorState. Так печатал каталог.

    Нарочная поломка: вернуть в каталог {error?.message ?? …} — падает.
  */
  it("ни один экран и общий компонент не выводит {error.message} в разметку", () => {
    const { readdirSync, readFileSync, statSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
    });
    const offenders = [...walk("app"), ...walk("src/components")]
      .filter(f => /\{\s*(error|err|q\.error)\??\.message/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
