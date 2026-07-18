import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CreateOrderInput, createOrder } from "../api";

const STORAGE_KEY = "pending_orders";

export interface OfflineOrder {
  id: string;
  input: CreateOrderInput;
  shopName: string;
  createdAt: string;
  synced: boolean;
  status?: "pending" | "syncing" | "failed";
  error?: string;
  retryable?: boolean; // true = network error (retry), false = business error (don't retry)
}

interface OfflineStore {
  orders: OfflineOrder[];
  loaded: boolean;
  load: () => Promise<void>;
  addOrder: (order: OfflineOrder) => Promise<void>;
  syncAll: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  retry: (id: string) => Promise<boolean>;
}

async function readQueue(): Promise<OfflineOrder[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(orders: OfflineOrder[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

/**
 * Check if an error is retryable (network) vs business error.
 */
function isRetryableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  // Network errors are retryable
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return true;
  if (msg.includes("econnrefused") || msg.includes("econnreset")) return true;
  // HTTP 5xx are retryable, 4xx are not
  if (msg.includes("status 5")) return true;
  if (msg.includes("status 4")) return false;
  return false;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  orders: [],
  loaded: false,

  load: async () => {
    const orders = await readQueue();
    set({ orders, loaded: true });
  },

  addOrder: async (order) => {
    const orders = [...get().orders, { ...order, status: "pending" as const }];
    set({ orders });
    await writeQueue(orders);
  },

  syncAll: async () => {
    let synced = 0;
    let failed = 0;

    // Snapshot orders once to avoid race conditions
    const currentOrders = get().orders;
    const pendingOrders = currentOrders.filter(o => !o.synced);

    if (pendingOrders.length === 0) return { synced: 0, failed: 0 };

    // Mark all as syncing
    const syncingOrders = currentOrders.map(o =>
      o.synced ? o : { ...o, status: "syncing" as const }
    );
    set({ orders: syncingOrders });
    await writeQueue(syncingOrders);

    const failedIds: Set<string> = new Set();

    for (const order of pendingOrders) {
      try {
        await createOrder(order.input);
        synced++;
      } catch (e) {
        failedIds.add(order.id);
        failed++;
        // Update the specific order with error info
        const idx = syncingOrders.findIndex(o => o.id === order.id);
        if (idx !== -1) {
          syncingOrders[idx] = {
            ...syncingOrders[idx],
            status: "failed" as const,
            error: e instanceof Error ? e.message : "Sync failed",
            retryable: isRetryableError(e),
          };
        }
      }
    }

    // Build final state: synced orders get synced=true, failed keep their status
    const finalOrders = syncingOrders.map(o => {
      if (o.synced) return o;
      if (failedIds.has(o.id)) return o; // already updated with error
      return { ...o, synced: true, status: "pending" as const };
    });

    set({ orders: finalOrders });
    await writeQueue(finalOrders);
    return { synced, failed };
  },

  remove: async (id) => {
    const orders = get().orders.filter((o) => o.id !== id);
    set({ orders });
    await writeQueue(orders);
  },

  clear: async () => {
    const remaining = get().orders.filter((o) => !o.synced);
    set({ orders: remaining });
    await writeQueue(remaining);
  },

  retry: async (id) => {
    const order = get().orders.find((o) => o.id === id);
    if (!order || order.synced) return false;

    const updated = get().orders.map((o) =>
      o.id === id ? { ...o, status: "syncing" as const, error: undefined } : o
    );
    set({ orders: updated });
    await writeQueue(updated);

    try {
      await createOrder(order.input);
      const finalOrders = get().orders.map((o) =>
        o.id === id ? { ...o, synced: true, status: "pending" as const } : o
      );
      set({ orders: finalOrders });
      await writeQueue(finalOrders);
      return true;
    } catch (e) {
      const finalOrders = get().orders.map((o) =>
        o.id === id
          ? { ...o, status: "failed" as const, error: e instanceof Error ? e.message : "Retry failed", retryable: isRetryableError(e) }
          : o
      );
      set({ orders: finalOrders });
      await writeQueue(finalOrders);
      return false;
    }
  },
}));
