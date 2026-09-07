/**
 * На экране человека в поле нет английского.
 *
 * Экраны показывали e.message как есть, а это текст axios: «Network Error»,
 * «timeout of 15000ms exceeded», «Request failed with status code 502». Агенту,
 * у которого пропала связь на въезде в кишлак, приложение сообщало об этом
 * по-английски — и на экране входа тоже.
 *
 * При этом сообщения самого сервера русские и полезные, и подменять их нельзя:
 * «Недостаточно товара на складе» — это то единственное, ради чего отказ и
 * показывают.
 */
import { describe, it, expect } from "@jest/globals";
import { errorText } from "../lib/error-text";

describe("слова сервера доходят как есть", () => {
  it("сообщение из тела ответа", () => {
    expect(errorText({ response: { status: 400, data: { message: "Недостаточно товара на складе" } } }))
      .toBe("Недостаточно товара на складе");
  });

  it("сообщение tRPC", () => {
    expect(errorText({ trpcMessage: "Заказ уже завершён" })).toBe("Заказ уже завершён");
  });
});

describe("английское наружу не выходит", () => {
  it("нет сети", () => {
    const out = errorText(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }));
    expect(out).toContain("связи");
    expect(out).not.toMatch(/[a-z]{4}/i); // никаких английских слов
  });

  it("превышено ожидание", () => {
    expect(errorText(new Error("timeout of 15000ms exceeded"))).toContain("вовремя");
  });

  it("сервер отвечает пятисоткой", () => {
    expect(errorText({ response: { status: 502 }, message: "Request failed with status code 502" }))
      .toContain("недоступен");
  });

  it("непонятная английская строка заменяется", () => {
    const out = errorText(new Error("Unexpected API response: empty json payload"));
    expect(out).toBe("Не получилось. Попробуйте ещё раз.");
  });

  it("ничего не пришло — тоже понятный текст", () => {
    expect(errorText(undefined)).toBe("Не получилось. Попробуйте ещё раз.");
    expect(errorText(null)).toBe("Не получилось. Попробуйте ещё раз.");
  });
});

describe("наши собственные русские сообщения сохраняются", () => {
  it("подготовка фото", () => {
    expect(errorText(new Error("Фото слишком большое. Снимите заново или выберите другое.")))
      .toContain("Фото слишком большое");
  });
});
