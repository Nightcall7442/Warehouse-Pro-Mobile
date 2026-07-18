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

    const syncingOrders: OfflineOrder[] = get().orders.map((o) =>
      o.synced ? o : { ...o, status: "syncing" as const }
    );
    set({ orders: syncingOrders });
    await writeQueue(syncingOrders);

    const remaining: OfflineOrder[] = [];

    for (const order of get().orders) {
      if (order.synced) continue;

      try {
        await createOrder(order.input);
        synced++;
      } catch (e) {
        remaining.push({
          ...order,
          status: "failed" as const,
          error: e instanceof Error ? e.message : "Sync failed",
        });
        failed++;
      }
    }

    const finalOrders: OfflineOrder[] = get().orders.map((o) => {
      if (o.synced) return o;
      if (remaining.find((r) => r.id === o.id)) {
        return remaining.find((r) => r.id === o.id)!;
      }
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
          ? { ...o, status: "failed" as const, error: e instanceof Error ? e.message : "Retry failed" }
          : o
      );
      set({ orders: finalOrders });
      await writeQueue(finalOrders);
      return false;
    }
  },
}));
