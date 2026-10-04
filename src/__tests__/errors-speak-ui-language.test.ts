/**
 * Отказ сервера — на языке интерфейса, и приложение верит пометке, а не буквам.
 *
 * Было: текст сервера показывался, если в нём есть кириллица. Сервер отвечал
 * только по-русски — и человек с узбекским интерфейсом читал «Недостаточно
 * товара» под узбекскими кнопками.
 *
 * Стало: приложение шлёт язык заголовком x-lang, сервер отвечает на нём и
 * помечает ответ (data.lang у tRPC, Content-Language у входа). errorText
 * показывает слова сервера, только когда пометка совпадает с языком
 * интерфейса. Старый сервер пометки не ставит — тогда русский текст достаётся
 * русскому интерфейсу, узбекскому — фраза по коду ответа.
 */
const mockRequestUse = jest.fn();
const mockPost = jest.fn();
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      interceptors: { request: { use: mockRequestUse }, response: { use: jest.fn() } },
      get: jest.fn(),
      post: jest.fn(),
    })),
    post: (...a: unknown[]) => mockPost(...a),
    isAxiosError: () => false,
  },
}));
jest.mock("../storage", () => ({
  SecureStore: { getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() },
}));

import { describe, it, expect, beforeEach } from "@jest/globals";
import { useLangStore } from "../i18n";
import { errorText } from "../lib/error-text";

const setLang = (lang: "ru" | "uz") => useLangStore.setState({ lang });

/** Ответ tRPC так, как его видит errorText после перехватчика api.ts. */
function trpcRefusal(message: string, status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { json: { message, data } } } },
    trpcMessage: message,
    trpcData: data,
  });
}

/** Ответ REST-входа: { error: "…" } и, у нового сервера, Content-Language. */
function loginRefusal(text: string, status: number, contentLanguage?: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: text }, headers: contentLanguage ? { "content-language": contentLanguage } : {} },
    config: { url: "https://wp.test/api/login" },
  });
}

beforeEach(() => setLang("ru"));

describe("язык интерфейса уходит в каждом запросе", () => {
  it("перехватчик ставит x-lang в момент запроса", async () => {
    require("../api");
    const intercept = mockRequestUse.mock.calls[0][0] as (c: { headers: Record<string, string> }) => Promise<{ headers: Record<string, string> }>;
    setLang("uz");
    expect((await intercept({ headers: {} })).headers["x-lang"]).toBe("uz");
    setLang("ru");
    expect((await intercept({ headers: {} })).headers["x-lang"]).toBe("ru");
  });

  it("вход тоже шлёт x-lang", async () => {
    const { login } = require("../api") as typeof import("../api");
    mockPost.mockResolvedValueOnce({ data: { success: true, token: "t", user: {} } });
    setLang("uz");
    await login("a@b.uz", "secret");
    const opts = mockPost.mock.calls[0][2] as { headers: Record<string, string> };
    expect(opts.headers["x-lang"]).toBe("uz");
  });
});

describe("слова сервера — когда он сказал их на языке интерфейса", () => {
  it("узбекский интерфейс, сервер ответил по-узбекски — как есть", () => {
    setLang("uz");
    const e = trpcRefusal("Mahsulot yetarli emas: «Сок» — mavjud 3, yana 7 kerak", 400, { code: "BAD_REQUEST", lang: "uz" });
    expect(errorText(e)).toBe("Mahsulot yetarli emas: «Сок» — mavjud 3, yana 7 kerak");
  });

  it("сервер ответил по-русски, а интерфейс узбекский — фраза по коду, не русский текст", () => {
    setLang("uz");
    const e = trpcRefusal("Заказ не найден", 404, { code: "NOT_FOUND", lang: "ru" });
    expect(errorText(e)).toBe("Topilmadi — ehtimol, o'chirilgan.");
  });

  it("старый сервер без пометки: русскому интерфейсу — его русский текст", () => {
    const e = trpcRefusal("Недостаточно товара на складе", 500, { code: "INTERNAL_SERVER_ERROR" });
    expect(errorText(e)).toBe("Недостаточно товара на складе");
  });

  it("старый сервер без пометки: узбекскому интерфейсу — фраза по коду", () => {
    setLang("uz");
    const e = trpcRefusal("Недостаточно товара на складе", 500, { code: "INTERNAL_SERVER_ERROR" });
    expect(errorText(e)).toBe("Bo'lmadi. Qayta urinib ko'ring.");
  });
});

describe("отказ входа", () => {
  it("новый сервер: текст на языке из Content-Language", () => {
    setLang("uz");
    expect(errorText(loginRefusal("Email yoki parol noto'g'ri", 401, "uz"))).toBe("Email yoki parol noto'g'ri");
  });

  it("заголовки AxiosHeaders читаются через get()", () => {
    setLang("uz");
    const e = loginRefusal("Email yoki parol noto'g'ri", 401);
    (e.response as { headers: unknown }).headers = { get: (n: string) => (n === "content-language" ? "uz" : undefined) };
    expect(errorText(e)).toBe("Email yoki parol noto'g'ri");
  });

  it("неверный пароль — это не «сессия закончилась»", () => {
    // Раньше строка { error: "…" } входа не читалась вовсе, и 401 входа
    // становился «Сессия закончилась» на экране, где сессии ещё нет.
    expect(errorText(loginRefusal("Неверный email или пароль", 401))).toBe("Неверный email или пароль");
    setLang("uz");
    expect(errorText(loginRefusal("Неверный email или пароль", 401))).toBe("Email yoki parol noto'g'ri.");
  });
});
