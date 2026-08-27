import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./auth";
import { notify } from "./toast";
import { CreateOrderInput, createOrder, markOutForDelivery, markDelivered, markFailed, completeDelivery, CompleteDeliveryInput } from "../api";

const S4 = () => ((1 + Math.random()) * 0x10000 | 0).toString(16).substring(1);

/**
 * A UUID the server will actually accept.
 *
 * RFC 4122 pins two things: the version nibble (the "4") and the variant
 * nibble, which must be 8, 9, a or b. This generator set the version but left
 * the variant to chance, so three keys out of four were malformed — and the
 * server validates with z.string().uuid(), which checks both. Every affected
 * order came back "Invalid UUID" / 400 and simply could not be placed.
 *
 * The bug was invisible until idempotency keys started being sent on the first
 * online attempt; before that only re-sends from the offline queue carried one.
 */
export function uuidv4() {
  const variant = "89ab"[(Math.random() * 4) | 0];
  return `${S4()}${S4()}-${S4()}-4${S4().slice(0, 3)}-${variant}${S4().slice(0, 3)}-${S4()}${S4()}${S4()}`;
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
  /**
   * Сумма, которую агент назвал владельцу магазина при оформлении.
   *
   * Сервер считает итог по СВОИМ ценам на момент отправки, а не по присланным
   * — и правильно делает: иначе приложение могло бы провести заказ по любой
   * цене. Но заказ, оформленный офлайн, уходит спустя часы, и если за это
   * время подняли прайс, накладная придёт на другую сумму, чем записано на
   * бумаге у владельца. Сохранённая здесь цифра позволяет заметить это сразу
   * после отправки и предупредить магазин заранее, а не у двери.
   */
  quotedTotal?: number;
  /**
   * Кто создал запись. Проставляется при постановке в очередь.
   *
   * Телефон в поле часто общий: агент сдаёт смену и передаёт его сменщику.
   * Без этой пометки очередь агента А уходила на сервер под токеном агента Б —
   * сервер берёт автора из сессии, а не из запроса. Заказы, выручка и комиссия
   * записывались не тому человеку, а отложенные действия курьера отваливались
   * с «заказ не назначен на вас».
   *
   * Поле необязательное: записи, созданные до этой правки, синхронизируются
   * по-прежнему. Отбросить их значило бы потерять работу, уже сделанную в поле.
   */
  ownerId?: number;
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
  /**
   * Кто создал запись. Проставляется при постановке в очередь.
   *
   * Телефон в поле часто общий: агент сдаёт смену и передаёт его сменщику.
   * Без этой пометки очередь агента А уходила на сервер под токеном агента Б —
   * сервер берёт автора из сессии, а не из запроса. Заказы, выручка и комиссия
   * записывались не тому человеку, а отложенные действия курьера отваливались
   * с «заказ не назначен на вас».
   *
   * Поле необязательное: записи, созданные до этой правки, синхронизируются
   * по-прежнему. Отбросить их значило бы потерять работу, уже сделанную в поле.
   */
  ownerId?: number;
}

interface OfflineStore {
  orders: OfflineOrder[];
  deliveryActions: OfflineDeliveryAction[];
  loaded: boolean;
  syncingOrders: boolean;
  syncingActions: boolean;
  load: () => Promise<void>;
  /**
   * Ставит запись в очередь. Возвращает, дошла ли она до диска.
   *
   * Раньше возвращалось void, и экран заказа считал постановку в очередь
   * всегда удавшейся. При переполненном хранилище заказ оставался только в
   * памяти, а экран стирал черновик и закрывался — заказ исчезал вместе с
   * процессом. Теперь вызывающий может не стирать черновик и сказать агенту
   * правду.
   */
  addOrder: (order: OfflineOrder) => Promise<boolean>;
  addDeliveryAction: (action: OfflineDeliveryAction) => Promise<boolean>;
  syncAll: () => Promise<{ synced: number; failed: number }>;
  syncDeliveryActions: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => Promise<void>;
  discardDeliveryAction: (id: string) => Promise<void>;
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

/**
 * Запись очереди на диск.
 *
 * Сбой здесь означал тихую потерю работы: заказ оставался только в памяти, в
 * списке отложенных выглядел сохранённым, и исчезал при первом же перезапуске
 * приложения — а перезапускает его система сама, когда телефон лежит в кармане
 * и памяти не хватает. Причина у сбоя приземлённая: на рабочих телефонах
 * кончается место.
 *
 * Молчать об этом нельзя: агент должен знать, что заказ надо продиктовать в
 * офис, а не обнаружить пропажу вечером.
 *
 * Признак успеха возвращается наверх: одного тоста мало. Экран заказа
 * показывал свой тост «Заказ сохранён офлайн» сразу после этого и затирал
 * предупреждение, а заодно стирал черновик и закрывался.
 */
async function writeQueue(orders: OfflineOrder[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    return true;
  } catch (e) {
    if (__DEV__) console.warn("[OfflineStore] Failed to write queue:", e);
    notify.error("Не удалось сохранить заказ на телефон — освободите место и передайте заказ в офис");
    return false;
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

/** Как и writeQueue: возвращает, дошла ли запись до диска. */
async function writeDeliveryActionsQueue(actions: OfflineDeliveryAction[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(DELIVERY_ACTIONS_KEY, JSON.stringify(actions));
    return true;
  } catch (e) {
    if (__DEV__) console.warn("[OfflineStore] Failed to write delivery actions queue:", e);
    notify.error("Не удалось сохранить отметку о доставке — освободите место на телефоне");
    return false;
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
 * The question is really "did the server decide anything?", and the HTTP status
 * cannot answer it here: most of the API rejects with a plain `throw new Error`,
 * which tRPC maps to 500, so "этот магазин удалён" and a crashed server arrive
 * with the identical status. What separates them is the tRPC error envelope —
 * present only when the request reached a handler that deliberately refused it.
 *
 * A bare 5xx with no envelope is the proxy or the platform talking: a restart
 * mid-deploy, a gateway timeout. Those must be retried, and the old code never
 * did — its `msg.includes("status 5")` check could not match what axios
 * actually writes, "Request failed with status code 502". An agent shown that
 * as a permanent failure simply re-enters the order by hand, and the fresh
 * submission carries a new idempotency key, so it lands as a real duplicate.
 */
export function isRetryableError(e: unknown): boolean {
  const err = e as {
    serverRejected?: boolean;
    trpcMessage?: string;
    response?: { status?: number };
  };

  const status = err?.response?.status;
  if (typeof status === "number") {
    // Разбор статуса стоит ВЫШЕ разбора конверта, и это принципиально.
    //
    // Раньше первой строкой шла проверка конверта, а 401 сервер отдаёт именно
    // конвертом tRPC — то есть с trpcMessage и serverRejected. Из-за этого вся
    // ветка со статусами была для 401/403 недостижима, и истёкший за ночь
    // токен помечал все накопленные за смену заказы retryable:false. После
    // такого их не берёт ни один автоматический проход (shouldAutoSync), и
    // повторный вход не помогает: в баннере остаются красные строки, которые
    // агент может только удалить, потеряв работу целиком.
    //
    // Истёкшая или отозванная сессия — не отказ по существу заказа. Заказ не
    // рассматривали; его надо отправить снова, когда человек войдёт заново.
    //
    // 403 входит сюда вместе с 401, и это сознательный выбор в пользу работы
    // агента. Клиент не может отличить «этот заказ не ваш» от «у организации
    // кончилась подписка» — оба приходят как FORBIDDEN. Первый случай сюда всё
    // равно не доходит: чужие записи отсеивает проверка владельца в
    // shouldAutoSync. Второй — обычное дело в этом продукте, и после продления
    // в офисе смена агента должна уехать сама, а не ждать, пока он вручную
    // ткнёт «Повторить» на каждой из пятнадцати красных строк.
    //
    // Цена ошибки несимметрична: лишние попытки — это шум в сети, застрявшая
    // очередь — это потерянный день работы.
    if (status === 401 || status === 403) return true;
    // 408 Request Timeout и 429 Too Many Requests — временные, хотя и 4xx.
    if (status === 408 || status === 429) return true;
    // Сервер принял и отказал по существу (нет товара, магазин удалён).
    // Повтор ничего не изменит.
    if (err?.serverRejected || err?.trpcMessage) return false;
    // 5xx without an envelope never reached a handler — infrastructure, not a verdict.
    return status >= 500;
  }

  // Ответа не было вовсе, но конверт остался — так выглядит ошибка, поднятая
  // из tRPC без HTTP-статуса. Решение сервером принято.
  if (err?.serverRejected || err?.trpcMessage) return false;

  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  // No response came back at all: the request never landed, so nothing was decided.
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return true;
  if (msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("aborted")) return true;
  // Fallback for an error that lost its response object (e.g. rehydrated from storage).
  if (/status(?: code)? 5\d\d/.test(msg)) return true;
  return false;
}

/**
 * Should an automatic sync pass pick this entry up?
 *
 * `retryable` was being written on every failure and then read by nobody — both
 * queues selected on `!synced` alone. So an entry the server had refused for
 * good (a deleted product, a shop that no longer exists) was re-sent on every
 * launch and every reconnect, forever, and sat in the agent's list as a red
 * item they had no way to clear short of reinstalling the app.
 *
 * `undefined` means never attempted, which is exactly what should be sent.
 * Only an explicit `false` — the server answered and refused — is skipped, and
 * only for automatic passes: the manual retry button still forces an attempt,
 * since the underlying cause may since have been fixed in the office.
 */
/**
 * Годится ли запись к отправке прямо сейчас.
 *
 * Кроме собственного состояния записи учитывается, кто сейчас в приложении:
 * чужую запись отправлять нельзя — сервер запишет её на текущего пользователя.
 * Она остаётся в очереди и уйдёт, когда её автор снова войдёт.
 */
function shouldAutoSync(
  entry: { synced: boolean; retryable?: boolean; ownerId?: number },
  currentUserId?: number,
): boolean {
  if (entry.synced || entry.retryable === false) return false;
  if (entry.ownerId != null && currentUserId != null && entry.ownerId !== currentUserId) return false;
  return true;
}

/**
 * Кто сейчас вошёл.
 *
 * Обычный импорт, а не отложенный: отложенный не работает в тестовой среде без
 * особого флага, и владелец записи там молча оставался бы пустым — то есть
 * проверка, ради которой всё делается, в тестах бы не работала. Цикла здесь
 * нет: auth про очередь не знает.
 */
function currentUserId(): number | undefined {
  return useAuthStore.getState().user?.id;
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
      ownerId: order.ownerId ?? currentUserId(),
      input: { ...order.input, idempotencyKey: order.input.idempotencyKey ?? uuidv4() },
      status: "pending" as const,
    };
    const orders = [...get().orders, withKey];
    set({ orders });
    // Результат записи на диск отдаётся вызывающему: заказ, оставшийся только
    // в памяти, не переживёт выгрузки приложения системой, и экран не должен
    // отчитываться об успехе.
    return writeQueue(orders);
  },

  addDeliveryAction: async (action) => {
    const deliveryActions = [...get().deliveryActions, { ...action, ownerId: action.ownerId ?? currentUserId(), status: "pending" as const }];
    set({ deliveryActions });
    return writeDeliveryActionsQueue(deliveryActions);
  },

  syncDeliveryActions: async () => {
    if (get().syncingActions) return { synced: 0, failed: 0 };
    set({ syncingActions: true });

    try {
      const currentActions = get().deliveryActions;
      const userId = currentUserId();
      const pendingActions = currentActions.filter(a => shouldAutoSync(a, userId));

      if (pendingActions.length === 0) return { synced: 0, failed: 0 };

      const inFlight = new Set(pendingActions.map(a => a.id));
      const syncingActions = currentActions.map(a =>
        inFlight.has(a.id) ? { ...a, status: "syncing" as const } : a
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
        // Left out of this pass (already refused for good, or queued while it
        // ran) — leave it exactly as it is. Falling through here would mark an
        // entry synced that was never actually sent.
        if (idx === -1) return a;
        if (results[idx].status === "rejected") {
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

      // Смерживаем с тем, что появилось, пока шёл проход — так же, как в
      // syncAll.
      //
      // Проход держит запросы до таймаута в 15 секунд. За это время курьер на
      // следующей точке успевает отметить заказ доставленным с суммой
      // наличных: addDeliveryAction дописывает запись в стейт и на диск, а
      // здесь стейт и диск перезаписывались срезом, снятым ДО отправки, — и
      // новая отметка исчезала. Ни ошибки, ни красной строки: заказ снова
      // числился «В пути», а принятые наличные не попадали никуда.
      const latest = get().deliveryActions;
      const addedDuringSync = latest.filter(a => !finalActions.some(f => f.id === a.id));
      const merged = [...finalActions, ...addedDuringSync];

      set({ deliveryActions: merged });
      await writeDeliveryActionsQueue(merged);
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
      const userId = currentUserId();
      const pendingOrders = snapshot.filter(o => shouldAutoSync(o, userId));

      if (pendingOrders.length === 0) return { synced: 0, failed: 0 };

      // Mark snapshot orders as syncing (don't re-read from store)
      const inFlight = new Set(pendingOrders.map(o => o.id));
      const syncingSnapshot = snapshot.map(o =>
        inFlight.has(o.id) ? { ...o, status: "syncing" as const } : o
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

      // Сверка названной суммы с посчитанной сервером.
      //
      // Делается сразу после отправки: ниже записи помечаются отправленными, и
      // сообщить агенту нужно именно про те заказы, которые только что ушли.
      for (let i = 0; i < pendingOrders.length; i++) {
        const outcome = results[i];
        if (outcome.status !== "fulfilled") continue;
        const quoted = pendingOrders[i].quotedTotal;
        const actual = outcome.value?.total;
        if (quoted == null || actual == null) continue;
        // Копейки не в счёт: расхождение в округлении не повод тревожить
        // человека.
        if (Math.abs(actual - quoted) < 1) continue;
        notify.warning(
          `${pendingOrders[i].shopName}: сумма изменилась — называли ` +
          `${Math.round(quoted).toLocaleString("ru")}, к оплате ` +
          `${Math.round(actual).toLocaleString("ru")} сум. Цены поменялись, пока заказ ждал отправки.`,
        );
      }

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

  // Throw away an entry the server will never accept. Without this the agent
  // is stuck looking at a permanent red row with no way to act on it.
  discardDeliveryAction: async (id) => {
    const deliveryActions = get().deliveryActions.filter((a) => a.id !== id);
    set({ deliveryActions });
    await writeDeliveryActionsQueue(deliveryActions);
  },

  clear: async () => {
    const remaining = get().orders.filter((o) => !o.synced);
    set({ orders: remaining });
    await writeQueue(remaining);
  },

  retry: async (id) => {
    const order = get().orders.find((o) => o.id === id);
    if (!order || order.synced) return false;
    const uid = currentUserId();
    if (order.ownerId != null && uid != null && order.ownerId !== uid) return false;

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
    const uid = currentUserId();
    if (action.ownerId != null && uid != null && action.ownerId !== uid) return false;

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
