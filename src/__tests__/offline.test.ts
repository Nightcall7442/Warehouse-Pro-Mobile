import AsyncStorage from "@react-native-async-storage/async-storage";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

// Mock API
jest.mock("../api", () => ({
  createOrder: jest.fn(),
}));

import { useOfflineStore, isRetryableError } from "../store/offline";
import { createOrder } from "../api";

const mockCreateOrder = createOrder as jest.MockedFunction<typeof createOrder>;

// ── Helper ──────────────────────────────────────────────────────────────────
function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: Date.now().toString(),
    input: { shopId: 1, items: [{ productId: 1, quantity: 1, unitPrice: 100 }] },
    shopName: "Test Shop",
    createdAt: new Date().toISOString(),
    synced: false,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("offline store", () => {
  beforeEach(async () => {
    // Force reset store state
    useOfflineStore.setState({ orders: [], loaded: false });
    // Reset mock
    mockCreateOrder.mockReset();
    jest.clearAllMocks();
  });

  describe("addOrder", () => {
    it("adds order to store", async () => {
      const { addOrder } = useOfflineStore.getState();
      const order = makeOrder();
      await addOrder(order);
      expect(useOfflineStore.getState().orders).toHaveLength(1);
      expect(useOfflineStore.getState().orders[0].status).toBe("pending");
    });

    it("persists to AsyncStorage", async () => {
      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "test-1" }));
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe("syncAll", () => {
    it("syncs all pending orders", async () => {
      mockCreateOrder.mockResolvedValue({ id: 1 });
      const { addOrder } = useOfflineStore.getState();

      await addOrder(makeOrder({ id: "o1" }));
      await addOrder(makeOrder({ id: "o2" }));

      const { syncAll } = useOfflineStore.getState();
      const result = await syncAll();

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    });

    it("handles failed sync", async () => {
      // Reset state
      useOfflineStore.setState({ orders: [] });
      mockCreateOrder.mockReset();

      mockCreateOrder.mockRejectedValueOnce(new Error("Network error"));
      mockCreateOrder.mockResolvedValueOnce({ id: 2 });

      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "o1" }));
      await addOrder(makeOrder({ id: "o2" }));

      const { syncAll } = useOfflineStore.getState();
      const result = await syncAll();

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);

      const state = useOfflineStore.getState();
      const failedOrder = state.orders.find(o => o.id === "o1");
      expect(failedOrder?.status).toBe("failed");
      expect(failedOrder?.error).toBe("Network error");
      expect(failedOrder?.retryable).toBe(true);
    });

    it("marks non-retryable errors correctly", async () => {
      useOfflineStore.setState({ orders: [] });
      mockCreateOrder.mockReset();

      mockCreateOrder.mockRejectedValue(new Error("Status 400: Bad request"));

      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "o1" }));

      const { syncAll } = useOfflineStore.getState();
      await syncAll();

      const state = useOfflineStore.getState();
      const failedOrder = state.orders.find(o => o.id === "o1");
      expect(failedOrder?.retryable).toBe(false);
    });

    it("returns 0 if no pending orders", async () => {
      useOfflineStore.setState({ orders: [] });
      mockCreateOrder.mockReset();

      const { syncAll } = useOfflineStore.getState();
      const result = await syncAll();
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("does not re-sync already synced orders", async () => {
      useOfflineStore.setState({ orders: [] });
      mockCreateOrder.mockReset();

      mockCreateOrder.mockResolvedValue({ id: 1 });
      const { addOrder } = useOfflineStore.getState();

      await addOrder(makeOrder({ id: "o1" }));
      await addOrder(makeOrder({ id: "o2" }));

      const { syncAll } = useOfflineStore.getState();
      await syncAll();

      mockCreateOrder.mockClear();
      const result = await syncAll();

      expect(result.synced).toBe(0);
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });

  describe("retry", () => {
    it("retries a failed order", async () => {
      mockCreateOrder.mockRejectedValueOnce(new Error("Network error"));
      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "o1" }));

      const { syncAll } = useOfflineStore.getState();
      await syncAll();

      mockCreateOrder.mockResolvedValue({ id: 1 });
      const { retry } = useOfflineStore.getState();
      const success = await retry("o1");

      expect(success).toBe(true);
      expect(useOfflineStore.getState().orders.find(o => o.id === "o1")?.synced).toBe(true);
    });

    it("returns false for non-existent order", async () => {
      const { retry } = useOfflineStore.getState();
      const success = await retry("nonexistent");
      expect(success).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes an order", async () => {
      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "o1" }));
      await addOrder(makeOrder({ id: "o2" }));

      const { remove } = useOfflineStore.getState();
      await remove("o1");

      expect(useOfflineStore.getState().orders).toHaveLength(1);
      expect(useOfflineStore.getState().orders[0].id).toBe("o2");
    });
  });

  describe("clear", () => {
    it("removes only synced orders", async () => {
      mockCreateOrder.mockResolvedValue({ id: 1 });
      const { addOrder } = useOfflineStore.getState();
      await addOrder(makeOrder({ id: "o1" }));
      await addOrder(makeOrder({ id: "o2" }));

      const { syncAll, clear } = useOfflineStore.getState();
      await syncAll();

      mockCreateOrder.mockRejectedValue(new Error("fail"));
      await syncAll();

      await clear();

      const state = useOfflineStore.getState();
      expect(state.orders.every(o => !o.synced)).toBe(true);
    });
  });
});

// ── Retry classification ─────────────────────────────────────────────────────
//
// What these guard: an entry marked non-retryable is presented to the agent as
// permanently failed, and their natural response is to re-enter the order by
// hand. That resubmission carries a fresh idempotency key, so the server has no
// way to recognise it — the office ends up with a real duplicate. Misjudging a
// transient server error is therefore how duplicate orders get created.
describe("isRetryableError", () => {
  function axiosLike(status: number) {
    const e = new Error(`Request failed with status code ${status}`) as Error & {
      response?: { status: number };
    };
    e.response = { status };
    return e;
  }

  it("treats 5xx as retryable — a restart mid-deploy is not the agent's fault", () => {
    expect(isRetryableError(axiosLike(500))).toBe(true);
    expect(isRetryableError(axiosLike(502))).toBe(true);
    expect(isRetryableError(axiosLike(503))).toBe(true);
  });

  it("treats a business rejection as final", () => {
    expect(isRetryableError(axiosLike(400))).toBe(false);
    expect(isRetryableError(axiosLike(403))).toBe(false);
    expect(isRetryableError(axiosLike(404))).toBe(false);
  });

  it("treats 408 and 429 as retryable despite being 4xx", () => {
    expect(isRetryableError(axiosLike(408))).toBe(true);
    expect(isRetryableError(axiosLike(429))).toBe(true);
  });

  it("treats an unanswered request as retryable", () => {
    expect(isRetryableError(new Error("Network Error"))).toBe(true);
    expect(isRetryableError(new Error("timeout of 30000ms exceeded"))).toBe(true);
  });

  it("still recognises a 5xx that lost its response object", () => {
    expect(isRetryableError(new Error("Request failed with status code 500"))).toBe(true);
  });

  it("does not retry a plain tRPC business message", () => {
    expect(isRetryableError(new Error("Недостаточно товара на складе"))).toBe(false);
  });
});
