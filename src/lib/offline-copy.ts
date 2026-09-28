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

/*
  ── Почему каталог — по магазину ─────────────────────────────────────────────

  Копия каталога была одна на человека, а цены и ступени («от 10 — 8500») у
  каждого магазина свои. Без связи окно выбора товара для магазина Б
  показывало цены магазина А, последнего открытого со связью, и «Итог» шёл
  по ним. А после перезагрузки без связи цены строк не переставлялись вовсе:
  строка со сканера или из корзины считалась по цене карточки за штуку, мимо
  ступеней магазина.

  Теперь у каждого магазина (и прайс-листа, где он задан) своя запись — только
  ОТЛИЧИЯ его цен от карточки: товары, остатки и названия лежат один раз,
  общей копией. Полная копия на каждый магазин съела бы хранилище: сотни
  позиций на тридцать магазинов — это мегабайты, а переполненное хранилище
  роняет запись офлайн-очереди заказов.

  Магазина, которого со связью не открывали, копия не знает. Тогда — цены
  карточки без ступеней (так сервер отвечает без магазина) и пометка
  cardPrices, чтобы экран сказал об этом прямо. Цена другого магазина не
  подставляется никогда.
*/
type CatalogRow = { id: number; unitPrice: string; basePrice?: string | null; tiers?: unknown };
/** Цена магазина и ступени — только у товаров, где они не совпадают с карточкой. */
type ShopPrices = Record<number, [string, unknown]>;

/** Сколько магазинов помнить. Дневной маршрут агента — два-три десятка точек. */
export const SHOP_PRICES_MAX = 30;

const key = (kind: OfflineKind, ownerId: number) => `offlineCopy.${kind}.${ownerId}`;
const pricesKey = (ownerId: number, scope: string) => `offlineCopy.products.${ownerId}.${scope}`;
/** Магазины с отложенными ценами, от давних к свежим. */
const scopesKey = (ownerId: number) => `offlineCopy.products.${ownerId}.scopes`;

async function readJson<T>(k: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Испорченная запись не должна ронять экран: ведём себя так, будто её нет.
    return null;
  }
}

/*
  Сохранения идут по одному. Список магазинов (scopes) обновляется чтением и
  перезаписью, а сохраняют копию двое сразу — экран заказа и окно выбора
  товара. Два сохранения для разных магазинов вперемешку теряли один из списка,
  и его запись цен уже никогда не вытеснялась.
*/
let turn: Promise<unknown> = Promise.resolve();

/** scope — магазин (и прайс-лист), чьи это цены; нужен только каталогу. */
export function saveOfflineCopy<T>(kind: OfflineKind, ownerId: number, data: T, scope?: string): Promise<void> {
  const next = turn.then(() => save(kind, ownerId, data, scope));
  turn = next;
  return next;
}

async function save<T>(kind: OfflineKind, ownerId: number, data: T, scope?: string): Promise<void> {
  try {
    const savedAt = new Date().toISOString();
    await AsyncStorage.setItem(key(kind, ownerId), JSON.stringify({ data, savedAt } satisfies Stored<T>));
    if (kind !== "products" || !scope || !Array.isArray(data)) return;

    const prices: ShopPrices = {};
    for (const r of data as CatalogRow[]) {
      if (r.basePrice == null || r.unitPrice !== r.basePrice || r.tiers != null) prices[r.id] = [r.unitPrice, r.tiers ?? null];
    }
    await AsyncStorage.setItem(pricesKey(ownerId, scope), JSON.stringify({ data: prices, savedAt } satisfies Stored<ShopPrices>));

    const scopes = [...((await readJson<string[]>(scopesKey(ownerId))) ?? []).filter(s => s !== scope), scope];
    await AsyncStorage.setItem(scopesKey(ownerId), JSON.stringify(scopes.slice(-SHOP_PRICES_MAX)));
    const evicted = scopes.slice(0, -SHOP_PRICES_MAX);
    if (evicted.length > 0) await AsyncStorage.multiRemove(evicted.map(s => pricesKey(ownerId, s)));
  } catch {
    /* Не записалась — значит без связи будет пусто, как и раньше. Не беда экрана. */
  }
}

export async function loadOfflineCopy<T>(kind: OfflineKind, ownerId: number, scope?: string): Promise<(Stored<T> & { cardPrices?: boolean }) | null> {
  const stored = await readJson<Stored<T>>(key(kind, ownerId));
  if (!stored || typeof stored !== "object" || !("data" in stored)) return null;
  if (kind !== "products" || !Array.isArray(stored.data)) return stored;

  // Общая копия несёт цены того магазина, что открывали последним, — поэтому
  // цена в ней заменяется всегда: ценой этого магазина или карточки.
  const own = scope ? await readJson<Stored<ShopPrices>>(pricesKey(ownerId, scope)) : null;
  const prices = own?.data ?? null;
  const data = (stored.data as CatalogRow[]).flatMap(r => {
    const p = prices?.[r.id];
    if (p) return [{ ...r, unitPrice: p[0], tiers: p[1] }];
    // Карточной цены нет (копия прежней версии) — такой товар показать не по
    // чему: чужая цена хуже пустоты.
    return r.basePrice == null ? [] : [{ ...r, unitPrice: r.basePrice, tiers: null }];
  });
  // Дата — старшая из двух: цены и остатки могли сняться в разные дни.
  const savedAt = own && own.savedAt < stored.savedAt ? own.savedAt : stored.savedAt;
  return { data: data as T, savedAt, cardPrices: !own };
}

/**
 * Вход человека: копии всех остальных — вон.
 *
 * Копия каталога — мегабайт и больше на человека, плюс до тридцати записей
 * цен. На сменном телефоне они копились за каждым, кто хоть раз входил, а у
 * AsyncStorage на Android предел около 6 МБ, и переполнение роняет запись
 * очереди заказов — ровно то, от чего бережёт SHOP_PRICES_MAX. Прежнему
 * человеку копия без связи не нужна: войти без связи он не сможет, а со
 * связью она перезапишется.
 *
 * Ключи ищутся по префиксу, а не по списку scopes: запись, выпавшая из
 * списка, иначе не стёрлась бы никогда. Черновики и точки GPS других людей
 * здесь не трогаются — это их работа (решение владельца 28.09.2026).
 */
export async function forgetOtherOwnersCopies(ownerId: number): Promise<void> {
  try {
    // offlineCopy.<вид>.<человек>[.<магазин>]
    const foreign = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith("offlineCopy.") && k.split(".")[2] !== String(ownerId));
    if (foreign.length > 0) await AsyncStorage.multiRemove(foreign);
  } catch { /* см. выше */ }
}
