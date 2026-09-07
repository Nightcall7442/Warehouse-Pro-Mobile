import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Отложенная копия списка — чтобы без связи было из чего собрать заказ.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Очередь неотправленных заказов в приложении написана и работает: заказ,
 * созданный без связи, ложится на диск и уходит, когда связь появится.
 *
 * Вот только СОЗДАТЬ его было нельзя. Список магазинов и каталог приходят
 * запросом, а запрос без связи не приходит: первый же шаг мастера — «выберите
 * магазин» — показывал пустоту. Кэш react-query живёт только в памяти и умирает
 * вместе с выгрузкой приложения из неё.
 *
 * Получалось приложение, которое умеет работать офлайн и не даёт начать.
 *
 * ── Почему копия помечена временем ──────────────────────────────────────────
 *
 * По остаткам и ценам агент разговаривает с хозяином магазина. Молча выдать
 * вчерашнее за сегодняшнее нельзя: он назовёт цену, которой уже нет. Поэтому
 * копия всегда возвращается вместе с датой, а экран обязан об этом сказать.
 *
 * ── Почему копия привязана к человеку ───────────────────────────────────────
 *
 * Телефон бывает общим на бригаду. Список магазинов одного агента — не список
 * другого, и показать чужие точки хуже, чем не показать никаких.
 */

export type OfflineKind = "shops" | "products";

interface Stored<T> {
  data: T;
  savedAt: string;
}

const key = (kind: OfflineKind, ownerId: number) => `offlineCopy.${kind}.${ownerId}`;

export async function saveOfflineCopy<T>(kind: OfflineKind, ownerId: number, data: T): Promise<void> {
  try {
    const payload: Stored<T> = { data, savedAt: new Date().toISOString() };
    await AsyncStorage.setItem(key(kind, ownerId), JSON.stringify(payload));
  } catch {
    /* Не записалась — значит без связи будет пусто, как и раньше. Не беда экрана. */
  }
}

export async function loadOfflineCopy<T>(kind: OfflineKind, ownerId: number): Promise<Stored<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key(kind, ownerId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return parsed as Stored<T>;
  } catch {
    // Испорченная запись не должна ронять экран: ведём себя так, будто её нет.
    return null;
  }
}

export async function forgetOfflineCopies(ownerId: number): Promise<void> {
  try {
    await AsyncStorage.multiRemove([key("shops", ownerId), key("products", ownerId)]);
  } catch { /* см. выше */ }
}
