/**
 * Пустой ответ сервера — это ответ, а не сбой.
 *
 * Разбор ответа бросал исключение на любом null в поле json. Сервер отвечает
 * null там, где искомого просто нет: ProductService на ненайденном штрих-коде
 * возвращает `result[0] ?? null`.
 *
 * Из-за этого экран сканера ловил исключение и показывал «Ошибка. Не удалось
 * найти товар», а честная ветка «Товар не найден» рядом была недостижима.
 * Отсутствие товара выглядело как поломка приложения, и агент шёл искать
 * неисправность там, где её нет.
 *
 * Проверка идёт сквозь настоящий разбор: подменён только сетевой слой.
 */

const mockGet = jest.fn();

jest.mock("axios", () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: mockGet,
    post: jest.fn(),
  })),
}));

jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn().mockResolvedValue("token"),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

describe("Ответ «ничего не найдено»", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("возвращает null, а не бросает исключение", async () => {
    // Ровно то, что отдаёт сервер на ненайденный штрих-код.
    mockGet.mockResolvedValue({ status: 200, data: { result: { data: { json: null } } } });

    const { findByBarcode } = require("../api");

    // До правки здесь летело «Unexpected API response: empty json payload».
    await expect(findByBarcode("4600000000000")).resolves.toBeNull();
  });

  it("найденный товар возвращается как есть", async () => {
    const product = { id: 7, code: "A-100", name: "Печенье", unitPrice: "12000.00", unit: "block", available: "40" };
    mockGet.mockResolvedValue({ status: 200, data: { result: { data: { json: product } } } });

    const { findByBarcode } = require("../api");
    await expect(findByBarcode("4600000000000")).resolves.toEqual(product);
  });

  it("настоящая ошибка сервера по-прежнему поднимается", async () => {
    // Отличать пустой ответ от ошибки — весь смысл правки: проглотить ошибку
    // было бы такой же ложью, только в другую сторону.
    mockGet.mockResolvedValue({
      status: 200,
      data: { result: { error: { message: "Нет доступа" } } },
    });

    const { findByBarcode } = require("../api");
    await expect(findByBarcode("4600000000000")).rejects.toThrow("Нет доступа");
  });
});
