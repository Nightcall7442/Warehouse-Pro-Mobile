import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CreateOrderInput, createOrder, markOutForDelivery, markDelivered, markFailed } from "../api";

const STORAGE_KEY = "pending_orders";
const DELIVERY_ACTIONS_KEY = "pending_delivery_actions";

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

export type DeliveryAction =
  | { type: "markOutForDelivery"; orderId: number }
  | { type: "markDelivered"; orderId: number; cashAmount?: string }
  | { type: "markFailed"; orderId: number; reason?: string };

export interface OfflineDeliveryAction {
  id: string;
  action: DeliveryAction;
  createdAt: string;
  synced: boolean;
  status?: "pending" | "syncing" | "failed";
  error?: string;
  retryable?: boolean;
}

interface OfflineStore {
  orders: OfflineOrder[];
  deliveryActions: OfflineDeliveryAction[];
  loaded: boolean;
  load: () => Promise<void>;
  addOrder: (order: OfflineOrder) => Promise<void>;
  addDeliveryAction: (action: OfflineDeliveryAction) => Promise<void>;
  syncAll: () => Promise<{ synced: number; failed: number }>;
  syncDeliveryActions: () => Promise<{ synced: number; failed: number }>;
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

async function readDeliveryActionsQueue(): Promise<OfflineDeliveryAction[]> {
  try {
    const raw = await AsyncStorage.getItem(DELIVERY_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeDeliveryActionsQueue(actions: OfflineDeliveryAction[]) {
  await AsyncStorage.setItem(DELIVERY_ACTIONS_KEY, JSON.stringify(actions));
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
  deliveryActions: [],
  loaded: false,

  load: async () => {
    const [orders, deliveryActions] = await Promise.all([readQueue(), readDeliveryActionsQueue()]);
    set({ orders, deliveryActions, loaded: true });
  },

  addOrder: async (order) => {
    const orders = [...get().orders, { ...order, status: "pending" as const }];
    set({ orders });
    await writeQueue(orders);
  },

  addDeliveryAction: async (action) => {
    const deliveryActions = [...get().deliveryActions, { ...action, status: "pending" as const }];
    set({ deliveryActions });
    await writeDeliveryActionsQueue(deliveryActions);
  },

  syncDeliveryActions: async () => {
    let synced = 0;
    let failed = 0;

    const currentActions = get().deliveryActions;
    const pendingActions = currentActions.filter(a => !a.synced);

    if (pendingActions.length === 0) return { synced: 0, failed: 0 };

    const syncingActions = currentActions.map(a =>
      a.synced ? a : { ...a, status: "syncing" as const }
    );
    set({ deliveryActions: syncingActions });
    await writeDeliveryActionsQueue(syncingActions);

    const failedIds: Set<string> = new Set();

    for (const entry of pendingActions) {
      try {
        const { action } = entry;
        if (action.type === "markOutForDelivery") {
          await markOutForDelivery(action.orderId);
        } else if (action.type === "markDelivered") {
          await markDelivered(action.orderId, action.cashAmount);
        } else if (action.type === "markFailed") {
          await markFailed(action.orderId, action.reason);
        }
        synced++;
      } catch (e) {
        failedIds.add(entry.id);
        failed++;
        const idx = syncingActions.findIndex(a => a.id === entry.id);
        if (idx !== -1) {
          syncingActions[idx] = {
            ...syncingActions[idx],
            status: "failed" as const,
            error: e instanceof Error ? e.message : "Sync failed",
            retryable: isRetryableError(e),
          };
        }
      }
    }

    const finalActions = syncingActions.map(a => {
      if (a.synced) return a;
      if (failedIds.has(a.id)) return a;
      return { ...a, synced: true, status: "pending" as const };
    });

    set({ deliveryActions: finalActions });
    await writeDeliveryActionsQueue(finalActions);
    return { synced, failed };
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
