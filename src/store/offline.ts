import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CreateOrderInput, createOrder, markOutForDelivery, markDelivered, markFailed, completeDelivery, CompleteDeliveryInput } from "../api";

const S4 = () => ((1 + Math.random()) * 0x10000 | 0).toString(16).substring(1);
export function uuidv4() {
  return `${S4()}${S4()}-${S4()}-4${S4().slice(0, 3)}-${S4()}-${S4()}${S4()}${S4()}`;
}

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
  | { type: "markFailed"; orderId: number; reason?: string }
  | { type: "completeDelivery"; input: CompleteDeliveryInput };

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
  syncingOrders: boolean;
  syncingActions: boolean;
  load: () => Promise<void>;
  addOrder: (order: OfflineOrder) => Promise<void>;
  addDeliveryAction: (action: OfflineDeliveryAction) => Promise<void>;
  syncAll: () => Promise<{ synced: number; failed: number }>;
  syncDeliveryActions: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  retry: (id: string) => Promise<boolean>;
  retryDeliveryAction: (id: string) => Promise<boolean>;
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
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    if (__DEV__) console.warn("[OfflineStore] Failed to write queue:", e);
  }
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
  try {
    await AsyncStorage.setItem(DELIVERY_ACTIONS_KEY, JSON.stringify(actions));
  } catch (e) {
    if (__DEV__) console.warn("[OfflineStore] Failed to write delivery actions queue:", e);
  }
}

/**
 * Is this worth trying again, or did the server genuinely refuse the request?
 *
 * The distinction is what the agent sees: a retryable entry is "not sent yet",
 * a non-retryable one is "this order will never go through, deal with it".
 * Getting it backwards is expensive — an agent told their order failed for good
 * simply re-enters it, and that fresh submission carries a new idempotency key,
 * so it lands as a real duplicate the office has to unpick.
 *
 * Read the HTTP status off the error rather than pattern-matching its text.
 * The string form axios produces is "Request failed with status code 502", so
 * the old `msg.includes("status 5")` check never once matched — every server
 * hiccup and every restart mid-deploy was reported to the agent as permanent.
 */
export function isRetryableError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (typeof status === "number") {
    // 408 Request Timeout and 429 Too Many Requests are transient despite being 4xx.
    if (status === 408 || status === 429) return true;
    return status >= 500;
  }

  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  // No response came back at all: the request never landed, so nothing was decided.
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return true;
  if (msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("aborted")) return true;
  // Fallback for an error that lost its response object (e.g. rehydrated from storage).
  if (/status(?: code)? 5\d\d/.test(msg)) return true;
  return false;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  orders: [],
  deliveryActions: [],
  loaded: false,
  syncingOrders: false,
  syncingActions: false,

  load: async () => {
    const [orders, deliveryActions] = await Promise.all([readQueue(), readDeliveryActionsQueue()]);
    set({ orders, deliveryActions, loaded: true });
  },

  addOrder: async (order) => {
    // Reuse the key from the failed online attempt if one was already generated —
    // regenerating here would let a lost-response case (server created the order,
    // client saw a network error) submit as a genuinely new, duplicate order.
    const withKey = {
      ...order,
      input: { ...order.input, idempotencyKey: order.input.idempotencyKey ?? uuidv4() },
      status: "pending" as const,
    };
    const orders = [...get().orders, withKey];
    set({ orders });
    await writeQueue(orders);
  },

  addDeliveryAction: async (action) => {
    const deliveryActions = [...get().deliveryActions, { ...action, status: "pending" as const }];
    set({ deliveryActions });
    await writeDeliveryActionsQueue(deliveryActions);
  },

  syncDeliveryActions: async () => {
    if (get().syncingActions) return { synced: 0, failed: 0 };
    set({ syncingActions: true });

    try {
      const currentActions = get().deliveryActions;
      const pendingActions = currentActions.filter(a => !a.synced);

      if (pendingActions.length === 0) return { synced: 0, failed: 0 };

      const syncingActions = currentActions.map(a =>
        a.synced ? a : { ...a, status: "syncing" as const }
      );
      set({ deliveryActions: syncingActions });
      await writeDeliveryActionsQueue(syncingActions);

      const results = await Promise.allSettled(
        pendingActions.map((entry) => {
          const { action } = entry;
          if (action.type === "markOutForDelivery") {
            return markOutForDelivery(action.orderId);
          } else if (action.type === "markDelivered") {
            return markDelivered(action.orderId, action.cashAmount);
          } else if (action.type === "completeDelivery") {
            return completeDelivery(action.input);
          } else {
            return markFailed(action.orderId, action.reason);
          }
        })
      );
      
      let synced = 0;
      let failed = 0;

      const finalActions = syncingActions.map(a => {
        if (a.synced) return a;
        const idx = pendingActions.findIndex((p) => p.id === a.id);
        if (idx !== -1 && results[idx].status === "rejected") {
          failed++;
          return {
            ...a,
            status: "failed" as const,
            error: results[idx].reason instanceof Error
              ? (results[idx].reason as Error).message
              : "Sync failed",
            retryable: isRetryableError(results[idx].reason),
          };
        }
        synced++;
        return { ...a, synced: true, status: "pending" as const };
      });

      set({ deliveryActions: finalActions });
      await writeDeliveryActionsQueue(finalActions);
      return { synced, failed };
    } finally {
      set({ syncingActions: false });
    }
  },

  syncAll: async () => {
    if (get().syncingOrders) return { synced: 0, failed: 0 };
    set({ syncingOrders: true });

    try {
      // Capture snapshot at start — work only with this snapshot to avoid race conditions
      const snapshot = get().orders;
      const pendingOrders = snapshot.filter(o => !o.synced);

      if (pendingOrders.length === 0) return { synced: 0, failed: 0 };

      // Mark snapshot orders as syncing (don't re-read from store)
      const syncingSnapshot = snapshot.map(o =>
        o.synced ? o : { ...o, status: "syncing" as const }
      );
      // Merge with any new orders added after snapshot
      const currentOrders = get().orders;
      const newOrders = currentOrders.filter(o => !syncingSnapshot.some(s => s.id === o.id));
      const mergedForWrite = [...syncingSnapshot, ...newOrders];
      set({ orders: mergedForWrite });
      await writeQueue(mergedForWrite);

      const results = await Promise.allSettled(
        pendingOrders.map((order) => createOrder(order.input))
      );

      let synced = 0;
      let failed = 0;

      // Build result map from snapshot only (not from current store)
      const resultMap = new Map<string, { status: "fulfilled" | "rejected"; reason?: unknown }>();
      for (let i = 0; i < pendingOrders.length; i++) {
        resultMap.set(pendingOrders[i].id, results[i]);
      }

      // Update only snapshot orders, preserve any new orders added during sync
      const finalSnapshot = syncingSnapshot.map(o => {
        const result = resultMap.get(o.id);
        if (!result) return o; // shouldn't happen
        if (result.status === "rejected") {
          failed++;
          return {
            ...o,
            status: "failed" as const,
            error: result.reason instanceof Error
              ? (result.reason as Error).message
              : "Sync failed",
            retryable: isRetryableError(result.reason),
          };
        }
        synced++;
        return { ...o, synced: true, status: "pending" as const };
      });

      // Merge updated snapshot with any new orders added during sync
      const latestOrders = get().orders;
      const addedDuringSync = latestOrders.filter(o => !finalSnapshot.some(s => s.id === o.id));
      const finalOrders = [...finalSnapshot, ...addedDuringSync];

      set({ orders: finalOrders });
      await writeQueue(finalOrders);
      return { synced, failed };
    } finally {
      set({ syncingOrders: false });
    }
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

  retryDeliveryAction: async (id) => {
    const action = get().deliveryActions.find((a) => a.id === id);
    if (!action || action.synced) return false;

    const updated = get().deliveryActions.map((a) =>
      a.id === id ? { ...a, status: "syncing" as const, error: undefined } : a
    );
    set({ deliveryActions: updated });
    await writeDeliveryActionsQueue(updated);

    try {
      const { markOutForDelivery, markDelivered, markFailed, completeDelivery } = await import("../../src/api");
      const act = action.action;
      if (act.type === "markOutForDelivery") await markOutForDelivery(act.orderId);
      else if (act.type === "markDelivered") await markDelivered(act.orderId, act.cashAmount);
      else if (act.type === "completeDelivery") await completeDelivery(act.input);
      else if (act.type === "markFailed") await markFailed(act.orderId, act.reason);

      const final = get().deliveryActions.map((a) =>
        a.id === id ? { ...a, synced: true, status: "pending" as const } : a
      );
      set({ deliveryActions: final });
      await writeDeliveryActionsQueue(final);
      return true;
    } catch (e) {
      const final = get().deliveryActions.map((a) =>
        a.id === id
          ? { ...a, status: "failed" as const, error: e instanceof Error ? e.message : "Retry failed", retryable: isRetryableError(e) }
          : a
      );
      set({ deliveryActions: final });
      await writeDeliveryActionsQueue(final);
      return false;
    }
  },
}));
