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

import { useOfflineStore, isRetryableError, uuidv4 } from "../store/offline";
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
//
// The inverse costs too: an entry wrongly kept as retryable is re-sent on every
// sync pass forever, because the queue selects on `!synced` alone.
describe("isRetryableError", () => {
  /** A bare 5xx from the proxy — no handler ever saw the request. */
  function gateway(status: number) {
    const e = new Error(`Request failed with status code ${status}`) as Error & {
      response?: { status: number };
    };
    e.response = { status };
    return e;
  }

  /** What trpcMutation throws once a handler has deliberately refused. */
  function rejected(message: string, status = 500) {
    const e = new Error(message) as Error & {
      response?: { status: number };
      serverRejected?: boolean;
    };
    e.response = { status };
    e.serverRejected = true;
    return e;
  }

  it("retries a bare 5xx — a restart mid-deploy is not the agent's fault", () => {
    expect(isRetryableError(gateway(500))).toBe(true);
    expect(isRetryableError(gateway(502))).toBe(true);
    expect(isRetryableError(gateway(503))).toBe(true);
  });

  it("does not retry a business rejection, even though tRPC maps it to 500", () => {
    // Most of the API throws a plain Error, so this is the common case by far.
    expect(isRetryableError(rejected("Недостаточно товара на складе"))).toBe(false);
    expect(isRetryableError(rejected("Заказ уже завершён"))).toBe(false);
    expect(isRetryableError(rejected("Магазин не найден", 404))).toBe(false);
  });

  it("does not retry a 4xx", () => {
    expect(isRetryableError(gateway(400))).toBe(false);
    expect(isRetryableError(gateway(403))).toBe(false);
    expect(isRetryableError(gateway(404))).toBe(false);
  });

  it("retries 408 and 429 despite them being 4xx", () => {
    expect(isRetryableError(gateway(408))).toBe(true);
    expect(isRetryableError(gateway(429))).toBe(true);
  });

  it("retries a request that never landed", () => {
    expect(isRetryableError(new Error("Network Error"))).toBe(true);
    expect(isRetryableError(new Error("timeout of 30000ms exceeded"))).toBe(true);
  });

  it("still recognises a 5xx that lost its response object", () => {
    expect(isRetryableError(new Error("Request failed with status code 500"))).toBe(true);
  });

  it("honours trpcMessage on an error that skipped the mutation wrapper", () => {
    // trpcQuery has no try/catch, so the raw axios error reaches callers with
    // trpcMessage attached by the interceptor but no serverRejected flag.
    const e = new Error("Request failed with status code 500") as Error & {
      trpcMessage?: string;
    };
    e.trpcMessage = "Магазин удалён";
    expect(isRetryableError(e)).toBe(false);
  });
});

// ── Auto-sync selection ──────────────────────────────────────────────────────
//
// `retryable` used to be written on every failure and read by nobody: both
// queues selected on `!synced` alone. An order the server had refused for good
// was therefore re-sent on every launch and every reconnect, and stayed in the
// agent's list as a red row they could not clear without reinstalling.
describe("auto-sync selection", () => {
  function rejected(message: string) {
    const e = new Error(message) as Error & { serverRejected?: boolean };
    e.serverRejected = true;
    return e;
  }

  beforeEach(() => {
    useOfflineStore.setState({ orders: [], deliveryActions: [], syncingOrders: false });
    mockCreateOrder.mockReset();
  });

  it("stops re-sending an order the server refused outright", async () => {
    mockCreateOrder.mockRejectedValue(rejected("Товар удалён"));
    await useOfflineStore.getState().addOrder(makeOrder({ id: "dead" }) as never);

    await useOfflineStore.getState().syncAll();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().orders[0].retryable).toBe(false);

    // Every later pass must leave it alone.
    await useOfflineStore.getState().syncAll();
    await useOfflineStore.getState().syncAll();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps re-sending an order that only failed for lack of signal", async () => {
    mockCreateOrder.mockRejectedValue(new Error("Network Error"));
    await useOfflineStore.getState().addOrder(makeOrder({ id: "offline" }) as never);

    await useOfflineStore.getState().syncAll();
    await useOfflineStore.getState().syncAll();
    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    expect(useOfflineStore.getState().orders[0].retryable).toBe(true);
  });

  it("never marks a skipped entry as synced", async () => {
    mockCreateOrder.mockRejectedValue(rejected("Магазин удалён"));
    await useOfflineStore.getState().addOrder(makeOrder({ id: "a" }) as never);
    await useOfflineStore.getState().syncAll();

    mockCreateOrder.mockResolvedValue({ id: 1 } as never);
    await useOfflineStore.getState().addOrder(makeOrder({ id: "b" }) as never);
    await useOfflineStore.getState().syncAll();

    const state = useOfflineStore.getState();
    expect(state.orders.find(o => o.id === "a")!.synced).toBe(false);
    expect(state.orders.find(o => o.id === "b")!.synced).toBe(true);
  });
});

// ── Idempotency key format ───────────────────────────────────────────────────
//
// The server validates this with z.string().uuid(), which enforces both the
// version nibble and the variant nibble. This generator set the version but
// left the variant to chance, so three keys in four were malformed and the
// order came back 400 "Invalid UUID" — the agent simply could not place it.
// Nothing caught it earlier because the key only used to be attached to
// re-sends from the offline queue, not to the first online attempt.
describe("uuidv4", () => {
  // Same pattern zod applies: version 1-5, variant 8/9/a/b.
  const RFC4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("always produces a key the server will accept", () => {
    const bad = Array.from({ length: 5000 }, uuidv4).filter(k => !RFC4122.test(k));
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("marks itself as version 4", () => {
    expect(new Set(Array.from({ length: 500 }, () => uuidv4()[14]))).toEqual(new Set(["4"]));
  });

  // If the variant were pinned to a single value the keys would still validate,
  // so check the generator actually varies across the allowed set.
  it("uses the whole allowed variant range", () => {
    const seen = new Set(Array.from({ length: 500 }, () => uuidv4()[19]));
    expect([...seen].sort()).toEqual(["8", "9", "a", "b"]);
  });

  it("does not repeat itself", () => {
    const keys = Array.from({ length: 5000 }, uuidv4);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
