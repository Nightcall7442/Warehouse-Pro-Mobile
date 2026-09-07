/**
 * Экраны поля: маршрут курьера, карта слежения, фотографии.
 *
 * Здесь закреплено то, чего не видно ни в типах, ни глазами на макете, но что
 * стоит человеку рабочего дня:
 *
 * — Перехват обрыва связи в доставках был написан, но не работал: `return`
 *   вместо `return await` выпускает обещание из try, и catch не срабатывает ни
 *   разу. Товар отдан, деньги в кармане, а действие не попало ни на сервер, ни
 *   в очередь. Типы на это молчат: код компилируется и выглядит правильным.
 *
 * — Карта слежения пересобирала свою страницу на каждый ответ опроса и
 *   грузилась заново каждые 15 секунд вместе с масштабом, который выставил
 *   супервайзер. Это тоже не видно в типах: строка HTML — просто строка.
 *
 * — Токен фотографий каждая картинка читала из связки ключей сама, на каждую
 *   плитку двухколоночной сетки.
 */
jest.mock("../store/theme", () => ({
  useThemeColors: () => ({
    bg: { card: "#fff", elevated: "#f0f0f0", secondary: "#fafafa", input: "#e0e0e0", primary: "#000" },
    text: { primary: "#000", secondary: "#666", muted: "#999", tertiary: "#888" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0", primaryDim: "#e8edf8" },
    accent: { primary: "#3b6fe0" },
    status: { success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

// Настоящий src/api тянет axios и всё хранилище — картинке нужен только адрес.
jest.mock("../api", () => ({ API_BASE: "https://warehouse.example" }));

const mockGetItem = jest.fn(async () => "TOKEN");
jest.mock("../storage", () => ({ SecureStore: { getItemAsync: () => mockGetItem() } }));

import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, waitFor } from "@testing-library/react";
import { SecureImage } from "../components/SecureImage";

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), "utf8");

describe("маршрут курьера", () => {
  const src = read("../../app/(tabs)/deliveries.tsx");

  it("перехват обрыва связи дожидается ответа, иначе очередь проходит мимо", () => {
    for (const call of [
      "return await markOutForDelivery(orderId)",
      "return await markDelivered(orderId, cashAmount)",
      "return await markFailed(orderId, reason)",
    ]) {
      // Без await обещание уходит из try наружу и catch ниже мёртв.
      expect([call, src.includes(call)]).toEqual([call, true]);
    }
  });

  it("гаснет только та карточка, по которой нажали", () => {
    // Общее isPending мутации гасило кнопки сразу на всех точках маршрута.
    // В мутацию теперь уходит весь заказ (очереди нужны его номер и магазин),
    // поэтому сравнивается order.id, а не голая переменная.
    expect(src).toContain("markDel.variables?.order.id === item.order.id");
    expect(src).toContain("markFail.variables?.order.id === item.order.id");
    expect(src).toContain("markOut.variables?.id === item.order.id");
  });

  it("первое касание после ввода суммы доходит до кнопки", () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("маршрут строится списком, а не двумя .map внутри прокрутки", () => {
    expect(src).toContain("<FlatList");
    expect(src).not.toContain("<ScrollView");
  });

  it("текст ошибки — человеку, и пустым не бывает", () => {
    expect(src).toContain("notify.error(failureText(e))");
    // Пустое сообщение сервера всплывало пустой красной полосой, а непустое —
    // английской строкой axios. Обе беды закрывает errorText: он всегда
    // возвращает непустой русский текст, а слова сервера пропускает как есть.
    expect(src).toContain("return errorText(e)");
    expect(src).not.toContain("e.message.trim()");
  });
});

describe("карта слежения", () => {
  const src = read("../components/YandexMapView.tsx");

  it("страница собирается один раз, а не на каждый ответ опроса", () => {
    // Html лежит в ref и не пересобирается: иначе карта перезагружается на
    // каждый ответ опроса — моргает и теряет выставленный человеком масштаб.
    expect(/htmlRef|sourceRef/.test(src)).toBe(true);
    expect(src).not.toContain("buildHtml(markers");
  });

  it("маркеры приезжают вставкой в уже открытую страницу", () => {
    // Имя функции не важно — важно, что метки вставляются в живую страницу
    // через injectJavaScript, а не приезжают с новой сборкой html.
    expect(/function (setMarkers|updateMarkers)\(/.test(src)).toBe(true);
    expect(/injectJavaScript\(`(setMarkers|updateMarkers)\(/.test(src)).toBe(true);
  });

  it("список маркеров передаётся строкой, а не вклеивается в код", () => {
    // Имя агента приходит с сервера: внутри injectJavaScript это чужой текст.
    expect(src).toContain("JSON.parse(json)");
  });

  it("общий вид выставляется один раз — дальше масштаб принадлежит человеку", () => {
    // Каждые 15 секунд приезжает новое положение агентов. Подгонять под них
    // рамку значило бы отбирать приближение, которое супервайзер только что
    // выставил, — поэтому общий вид ставится единожды и запоминается флагом.
    expect(/fitted|didFit|firstFit/.test(src)).toBe(true);
  });
});

describe("каталог", () => {
  const src = read("../../app/(tabs)/catalog.tsx");

  it("на сервер уходит задержанная строка поиска, в поле — мгновенная", () => {
    expect(src).toContain("useDebounce(search, 300)");
    expect(src).toContain('queryKey: ["products", debouncedSearch]');
    // Прежние карточки остаются на экране вместо серых заглушек.
    expect(src).toContain("placeholderData: keepPreviousData");
  });

  it("после быстрого заказа остаток перестаёт быть вчерашним", () => {
    expect(src).toContain('[["myOrders"], ["products"], ["availableShops"], ["plans"]]');
  });

  it("остаток печатается количеством, а не «150.00»", () => {
    expect(src).toContain("formatQty(product.available)");
  });
});

describe("фотографии", () => {
  it("токен читается один раз на все картинки списка", async () => {
    render(
      <>
        <SecureImage uri="/api/photos/1" />
        <SecureImage uri="/api/photos/2" />
        <SecureImage uri="/api/photos/3" />
      </>,
    );
    await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
    // Связка ключей — не переменная в памяти: прокрутка сетки дёргала её на
    // каждую плитку.
    expect(mockGetItem).toHaveBeenCalledTimes(1);
  });

  it("внешняя ссылка и data: обходятся без хранилища", async () => {
    mockGetItem.mockClear();
    render(<SecureImage uri="data:image/png;base64,AAA" />);
    await waitFor(() => expect(mockGetItem).not.toHaveBeenCalled());
  });

  it("не открывшееся фото показывает заглушку, а не пустое место", () => {
    const src = read("../components/SecureImage.tsx");
    expect(src).toContain("onError={");
    expect(src).toContain("failedUri === uri");
  });
});
