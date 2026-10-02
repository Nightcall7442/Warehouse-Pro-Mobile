import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ShopLight } from "../api";

/*
  Последний полученный светофор магазина — на случай подсобки без связи.

  Агент открывает карточку магазина у прилавка, а связи нет: запрос shop.light
  не приходит. Пустое место там, где минуту назад было «Грузить рискованно»,
  хуже вчерашнего ответа с пометкой времени — по нему агент хотя бы знает, что
  просрочка была. Поэтому каждый полученный светофор откладывается, а экран
  без связи показывает отложенный с «на {время}». Нет отложенного — блока нет.

  Ключ — как у копий магазинов и каталога (lib/offline-copy):
  offlineCopy.<вид>.<человек>. Вход другого человека стирает чужие копии сам
  (forgetOtherOwnersCopies): светофор чужих точек на сменном телефоне не нужен.
*/

export interface CachedLight {
  light: ShopLight;
  savedAt: string;
}

/** Сколько магазинов помнить: столько же, сколько отдаёт один пакет shop.lights. */
export const SHOP_LIGHTS_MAX = 500;

const key = (ownerId: number) => `offlineCopy.shopLights.${ownerId}`;

async function read(ownerId: number): Promise<Record<string, CachedLight>> {
  try {
    const raw = await AsyncStorage.getItem(key(ownerId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CachedLight>) : {};
  } catch {
    // Испорченная запись не роняет экран — как будто её нет.
    return {};
  }
}

/*
  Записи по одной: список и карточка сохраняют одновременно, а запись — это
  чтение и перезапись всего словаря. Вперемешку одна затёрла бы другую.
*/
let turn: Promise<unknown> = Promise.resolve();

/** Отложить полученные светофоры (поверх прежних этих же магазинов). */
export function rememberLights(ownerId: number, lights: ShopLight[], now: Date = new Date()): Promise<void> {
  if (lights.length === 0) return Promise.resolve();
  const next = turn.then(async () => {
    try {
      const all = await read(ownerId);
      const savedAt = now.toISOString();
      for (const l of lights) all[String(l.shopId)] = { light: l, savedAt };
      // Самые давние — вон, когда магазинов больше предела.
      const kept = Object.entries(all).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt)).slice(0, SHOP_LIGHTS_MAX);
      await AsyncStorage.setItem(key(ownerId), JSON.stringify(Object.fromEntries(kept)));
    } catch {
      /* Не записалось — без связи блока просто не будет, как раньше. */
    }
  });
  turn = next;
  return next;
}

/** Отложенные светофоры этих магазинов. Чего нет — того в ответе нет. */
export async function recallLights(ownerId: number, shopIds: number[]): Promise<Map<number, CachedLight>> {
  const all = await read(ownerId);
  const out = new Map<number, CachedLight>();
  for (const id of shopIds) {
    const c = all[String(id)];
    if (c?.light && typeof c.savedAt === "string") out.set(id, c);
  }
  return out;
}

/** Когда снят отложенный светофор: «10:42» сегодня, «01.10 10:42» — раньше. */
export function lightStamp(savedAt: string, now: Date = new Date()): string {
  const d = new Date(savedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? time : `${p(d.getDate())}.${p(d.getMonth() + 1)} ${time}`;
}
