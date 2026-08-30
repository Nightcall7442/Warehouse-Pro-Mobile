jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("../api", () => ({
  createOrder: jest.fn(),
}));

import { useOfflineStore } from "../store/offline";
import { createOrder } from "../api";

const mockCreateOrder = createOrder as jest.MockedFunction<typeof createOrder>;

/**
 * Вычеркнутое агентом не должно возвращаться.
 *
 * Итог синхронизации собирался от среза, снятого В НАЧАЛЕ прохода: к нему
 * добавлялось появившееся, но никогда не вычиталось удалённое. Проход по сети
 * занимает до двух минут — если агент за это время вычеркнул красную строку,
 * она возвращалась и в список, и на диск.
 *
 * Дубля заказа отсюда не выходит: такая запись исключена из автоматической
 * отправки, а при ручном повторе уходит с прежним ключом идемпотентности, и
 * сервер отдаёт уже созданный заказ. Но вычеркнутое, возвращающееся само,
 * читается как поломка — и человек перестаёт верить кнопке.
 */

function makeOrder(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] },
    shopName: "Магазин " + id,
    createdAt: new Date().toISOString(),
    synced: false,
    ownerId: 1,
    ...extra,
  };
}

describe("Удалённое во время синхронизации", () => {
  beforeEach(() => {
    useOfflineStore.setState({ orders: [], loaded: true, syncingOrders: false });
    mockCreateOrder.mockReset();
  });

  it("не возвращается в очередь", async () => {
    const doomed = makeOrder("удаляемый");
    const other = makeOrder("остаётся");
    useOfflineStore.setState({ orders: [doomed, other] });

    // Пока идёт отправка, агент вычёркивает строку — ровно та гонка, из-за
    // которой она и воскресала.
    mockCreateOrder.mockImplementation(async () => {
      await useOfflineStore.getState().remove("удаляемый");
      return { id: 1 };
    });

    await useOfflineStore.getState().syncAll();

    const ids = useOfflineStore.getState().orders.map(o => o.id);
    expect(ids).not.toContain("удаляемый");
    // Остальное на месте: вычитаем только удалённое, а не всё подряд.
    expect(ids).toContain("остаётся");
  });

  it("появившееся во время прохода сохраняется", async () => {
    // Обратная сторона того же слияния, и она уже работала — проверяем, что
    // правка её не сломала.
    useOfflineStore.setState({ orders: [makeOrder("первый")] });

    mockCreateOrder.mockImplementation(async () => {
      await useOfflineStore.getState().addOrder(makeOrder("новый"));
      return { id: 1 };
    });

    await useOfflineStore.getState().syncAll();

    const ids = useOfflineStore.getState().orders.map(o => o.id);
    expect(ids).toContain("новый");
  });
});
