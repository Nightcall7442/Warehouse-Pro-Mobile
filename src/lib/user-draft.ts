import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Черновики заказа и отчёта о визите — у каждого человека свои.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Ключ был один на телефон («order_draft», «visit_draft_<план>»), и чтобы
 * сменщик на общем телефоне не получил чужой черновик, его стирали при любом
 * конце сессии — в том числе по ответу 401, когда токен просто истёк. Тот же
 * мерчандайзер, вошедший обратно через минуту, терял чек-лист на двести
 * позиций, набранный в магазине: другой копии нет.
 *
 * Теперь в ключе номер человека. Чужой черновик не показывается, потому что
 * его не находят по ключу, а не потому, что его стёрли, — и свой переживает
 * повторный вход.
 *
 * ── Старые ключи ────────────────────────────────────────────────────────────
 *
 * Черновик под старым ключом подхватывается как свой. Это безопасно: прежняя
 * версия стирала такие ключи при каждом входе и выходе, и sweepDrafts делает
 * то же при каждом конце сессии. Значит, если он лежит, его набрал тот, чья
 * сессия идёт сейчас.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_ORDER = "order_draft";
/** Старый ключ визита — «visit_draft_<план>», без номера человека. */
const LEGACY_VISIT = /^visit_draft_[^_]+$/;

export interface DraftSlot { key: string; legacy: string }

/** Без человека черновика нет: писать его некуда и показывать некому. */
export const orderDraftSlot = (userId?: number | null): DraftSlot | null =>
  userId == null ? null : { key: `order_draft:${userId}`, legacy: LEGACY_ORDER };

export const visitDraftSlot = (userId: number | null | undefined, planId: string): DraftSlot | null =>
  userId == null ? null : { key: `visit_draft_${userId}_${planId}`, legacy: `visit_draft_${planId}` };

export async function saveUserDraft<T extends object>(slot: DraftSlot | null, draft: T): Promise<void> {
  if (!slot) return;
  try {
    await AsyncStorage.setItem(slot.key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* черновик — подстраховка, не повод ронять экран */ }
}

export async function loadUserDraft<T>(slot: DraftSlot | null): Promise<(T & { savedAt: number }) | null> {
  if (!slot) return null;
  try {
    const raw = (await AsyncStorage.getItem(slot.key)) ?? (await AsyncStorage.getItem(slot.legacy));
    if (!raw) return null;
    const draft = JSON.parse(raw) as T & { savedAt: number };
    // Суточный черновик скорее запутает, чем поможет.
    if (!(Date.now() - draft.savedAt <= DAY_MS)) {
      await clearUserDraft(slot);
      return null;
    }
    return draft;
  } catch { return null; }
}

export async function clearUserDraft(slot: DraftSlot | null): Promise<void> {
  if (!slot) return;
  try { await AsyncStorage.multiRemove([slot.key, slot.legacy]); } catch { /* см. выше */ }
}

/**
 * Конец сессии: убрать то, что уже никому не покажется.
 *
 * Старые ключи без человека уходят всегда — чьи они, после конца сессии уже
 * не сказать. Свои черновики каждого человека остаются, кроме просроченных:
 * иначе брошенные отчёты по планам копились бы на телефоне вечно.
 */
export async function sweepDrafts(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(LEGACY_ORDER) || k.startsWith("visit_draft_"));
    if (keys.length === 0) return;
    const dead = (await AsyncStorage.multiGet(keys))
      .filter(([k, raw]) => k === LEGACY_ORDER || LEGACY_VISIT.test(k) || !isFresh(raw))
      .map(([k]) => k);
    if (dead.length > 0) await AsyncStorage.multiRemove(dead);
  } catch { /* хранилище недоступно — выход всё равно должен состояться */ }
}

function isFresh(raw: string | null): boolean {
  try { return Date.now() - (JSON.parse(raw ?? "") as { savedAt: number }).savedAt <= DAY_MS; }
  catch { return false; }
}
