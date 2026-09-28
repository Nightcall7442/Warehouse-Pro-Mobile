import { useMemo } from "react";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useAuthStore } from "./auth";
import { errorText } from "../lib/error-text";
import { isLocalShopId, isOwnedBy, isRetryableError, shouldAutoSync, useOfflineStore } from "./offline";
import { createShop, uploadFile, type CreateShopInput, type Shop } from "../api";
import { notify } from "./toast";
import { tt } from "../i18n";

/*
  Четвёртая очередь: магазин, заведённый без связи.

  Агент у новой точки без сети получал «Нажмите «Создать» ещё раз» и не мог
  ни сохранить анкету, ни оформить заказ на магазин, которого сервер не знает.
  Теперь магазин ложится сюда с временным отрицательным id, сразу виден в
  списке и в выборе магазина для заказа, а при связи уходит первым: с тем же
  ключом попытки, что и нажатие «Создать» (повтор после потерянного ответа
  сервер узнаёт и возвращает тот же магазин), — и только потом его заказы,
  уже с настоящим id.

  Снимок копируется в папку приложения: кэш камеры система чистит сама, а
  магазин может ждать связи до вечера.
*/

export interface PendingShop {
  /** Временный id, отрицательный (isLocalShopId). */
  localId: number;
  /** Анкета с ключом попытки экрана — одним на все повторы. */
  input: CreateShopInput & { idempotencyKey: string };
  /** Снимок в папке приложения; грузится при отправке. */
  photoUri?: string;
  createdAt: string;
  ownerId?: number;
  synced: boolean;
  status_?: "pending" | "failed";
  error?: string;
  retryable?: boolean;
}

const KEY = "pending_shops";

async function read(): Promise<PendingShop[]> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? (JSON.parse(raw) as PendingShop[]) : []; }
  catch { return []; }
}
async function write(list: PendingShop[]): Promise<boolean> {
  // На диск — только неотправленное: ушедший магазин живёт на сервере.
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list.filter(s => !s.synced))); return true; }
  catch { return false; }
}

/** Копия снимка в папку приложения. Не вышло — остаётся ссылка на кэш, как у визитов. */
async function keepPhoto(uri: string): Promise<string> {
  const dir = FileSystem.documentDirectory;
  if (!dir) return uri;
  const to = `${dir}shop-${Date.now()}.jpg`;
  try { await FileSystem.copyAsync({ from: uri, to }); return to; }
  catch { return uri; }
}

/** Удаляется только своя копия: чужой файл (кэш камеры) не наш. */
function dropPhoto(uri?: string): void {
  const dir = FileSystem.documentDirectory;
  if (uri && dir && uri.startsWith(dir)) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/**
 * Ссылка на фото магазина: уже загружено — она; есть файл — загрузить.
 *
 * Файл пропал или сервер отверг снимок — магазин уходит без фото: он нужен
 * для заказов, которые ждут его в очереди, а фото доснимут. Сетевой отказ —
 * наверх: проход остановится и повторит позже.
 */
async function photoUrlOf(s: PendingShop): Promise<{ url?: string; lost?: boolean }> {
  if (s.input.photoUrl || !s.photoUri) return { url: s.input.photoUrl };
  try {
    // require, а не импорт сверху: выбор магазина в заказе читает эту очередь,
    // и экран заказа тянул бы за собой нативный модуль обработки снимков —
    // в тестах экрана его нет, и они падали бы на импорте.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { preparePhoto } = require("../lib/prepare-photo") as typeof import("../lib/prepare-photo");
    const { dataUrl } = await preparePhoto(s.photoUri);
    return { url: await uploadFile(dataUrl, "shops") };
  } catch (e) {
    if (isRetryableError(e)) throw e;
    return { lost: true };
  }
}

interface ShopQueue {
  shops: PendingShop[];
  loaded: boolean;
  syncing: boolean;
  load: () => Promise<void>;
  /**
   * Ставит магазин в очередь; возвращает, дошла ли запись до диска.
   *
   * Хозяин — обязательный и снимается экраном ДО запроса: в очередь магазин
   * попадает из onError, а при 401 перехватчик (src/api.ts) к этому моменту
   * уже обнулил вошедшего. Взятый здесь, из стора, хозяин был бы пустым, и
   * магазин агента А видел бы и отправлял под собой следующий вошедший.
   * Без хозяина — отказ: экран скажет «Магазин НЕ сохранён».
   */
  add: (input: PendingShop["input"], photoUri: string | undefined, ownerId: number | undefined) => Promise<boolean>;
  sync: () => Promise<{ synced: number; failed: number }>;
  /** Убрать магазин — вместе с заказами на него: без магазина они не уйдут никогда. */
  remove: (localId: number) => Promise<void>;
  /** Отвергнутый сервером — снова в проход (причину могли исправить в офисе), следом его заказы. */
  retry: (localId: number) => Promise<void>;
}

export const useShopQueue = create<ShopQueue>((set, get) => {
  const patch = (localId: number, p: Partial<PendingShop>) => {
    const shops = get().shops.map(s => (s.localId === localId ? { ...s, ...p } : s));
    set({ shops });
    return write(shops);
  };

  return {
    shops: [],
    loaded: false,
    syncing: false,

    load: async () => { set({ shops: await read(), loaded: true }); },

    add: async (input, photoUri, ownerId) => {
      if (ownerId == null) return false;
      // Запись поверх непрочитанного диска стёрла бы магазины прошлого запуска.
      if (!get().loaded) await get().load();
      // Тот же ключ — та же попытка (не записалось, нажали «Создать» ещё раз):
      // заменяем, а не заводим вторую карточку того же магазина.
      const same = get().shops.find(s => s.input.idempotencyKey === input.idempotencyKey);
      let localId = same?.localId ?? -Date.now();
      while (!same && get().shops.some(s => s.localId === localId)) localId--;
      const entry: PendingShop = {
        localId, input,
        photoUri: photoUri ? await keepPhoto(photoUri) : undefined,
        createdAt: same?.createdAt ?? new Date().toISOString(),
        ownerId,
        synced: false, status_: "pending",
      };
      if (same && same.photoUri !== entry.photoUri) dropPhoto(same.photoUri);
      const shops = [...get().shops.filter(s => s.localId !== localId), entry];
      set({ shops });
      return write(shops);
    },

    sync: async () => {
      // Проход может прийти раньше чтения с диска (холодный старт) — тогда
      // заказы на новый магазин ждали бы следующего повода.
      if (!get().loaded) await get().load();
      if (get().syncing) return { synced: 0, failed: 0 };
      set({ syncing: true });
      try {
        const userId = useAuthStore.getState().user?.id;
        // Вошедший — перед каждым запросом, а не раз на проход: см. syncAll в
        // store/offline. Снимок или создание висят на слабой связи, А выходит,
        // входит Б — и остаток уходил бы токеном Б.
        const still = () => useAuthStore.getState().user?.id === userId;
        // Правило владельца то же, что у остальных очередей: чужое и ничьё не отправляем.
        const pending = get().shops.filter(s => shouldAutoSync(s, userId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (pending.length === 0) return { synced: 0, failed: 0 };

        let synced = 0, failed = 0, networkDown = false;
        const outcome = new Map<number, Partial<PendingShop>>();
        for (const s of pending) {
          if (networkDown || !still()) { outcome.set(s.localId, { status_: "pending" }); continue; }
          try {
            const photo = await photoUrlOf(s);
            // Загруженное запоминается сразу: сорвётся создание — повтор не
            // погонит снимок по слабой связи второй раз.
            if (photo.url && photo.url !== s.input.photoUrl) await patch(s.localId, { input: { ...s.input, photoUrl: photo.url } });
            if (!still()) { outcome.set(s.localId, { status_: "pending" }); continue; }
            const res = await createShop({ ...s.input, photoUrl: photo.url });
            // Сначала заказы получают настоящий id, потом запись уходит из
            // очереди: оборвись всё здесь — повтор с тем же ключом вернёт
            // тот же магазин, и переписывание повторится.
            await useOfflineStore.getState().remapShopId(s.localId, res.id);
            if (photo.lost) notify.warning(tt(`«${s.input.name}»: фото не сохранилось — магазин создан без фото`, `«${s.input.name}»: rasm saqlanmadi — do'kon rasmsiz yaratildi`));
            synced++;
            outcome.set(s.localId, { synced: true });
          } catch (e) {
            failed++;
            // 403 остаётся повторяемым, как во всех очередях (isRetryableError):
            // его же отдаёт сервер при истёкшей подписке. Отказом по существу
            // он метил «отвергнутыми» все магазины агента за один проход,
            // заказы на них получали «не уйдёт» с кнопкой «Удалить», а после
            // продления автопроход их уже не брал. Но и проход 403 не
            // останавливает, как останавливает «нет связи»: сервер ответил,
            // и за этим магазином могут стоять те, которым он не откажет.
            // Причина видна на карточке, магазин уйдёт следующим проходом.
            const retryable = isRetryableError(e);
            const forbidden = (e as { response?: { status?: number } })?.response?.status === 403;
            outcome.set(s.localId, { status_: "failed", error: errorText(e), retryable });
            if (retryable && !forbidden) networkDown = true;
          }
        }
        // Сливаем с тем, что добавили, пока шёл проход; отправленное — вон.
        const latest = get().shops.map(s => (outcome.has(s.localId) ? { ...s, ...outcome.get(s.localId) } : s));
        const merged = latest.filter(s => !s.synced);
        set({ shops: merged });
        await write(merged);
        latest.filter(s => s.synced).forEach(s => dropPhoto(s.photoUri));
        return { synced, failed };
      } finally {
        set({ syncing: false });
      }
    },

    remove: async (localId) => {
      const gone = get().shops.find(s => s.localId === localId);
      const shops = get().shops.filter(s => s.localId !== localId);
      set({ shops });
      await write(shops);
      dropPhoto(gone?.photoUri);
      const offline = useOfflineStore.getState();
      for (const o of offline.orders.filter(o => o.input.shopId === localId)) await offline.remove(o.id);
    },

    retry: async (localId) => {
      await patch(localId, { retryable: undefined, status_: "pending", error: undefined });
      const { synced } = await get().sync();
      if (synced > 0) await useOfflineStore.getState().syncAll();
    },
  };
});

/**
 * Свои неотправленные магазины (телефон бывает общим — чужие не показываем).
 * Без хозяина — не свой ни для кого (isOwnedBy).
 */
export function useMyPendingShops(): PendingShop[] {
  const shops = useShopQueue(s => s.shops);
  const userId = useAuthStore(s => s.user?.id);
  return useMemo(() => shops.filter(s => !s.synced && isOwnedBy(s, userId)), [shops, userId]);
}

/** Сервер отказал по существу — сам магазин не уйдёт. */
export function isRejectedShop(s: PendingShop): boolean {
  return s.status_ === "failed" && s.retryable === false;
}

/**
 * Новые магазины в виде обычных — для выбора магазина в заказе.
 * Отвергнутые не предлагаются: заказ на них встал бы намертво.
 */
export function usePendingShops(): Shop[] {
  const mine = useMyPendingShops();
  return useMemo(() => mine.filter(s => !isRejectedShop(s)).map(s => ({
    id: s.localId, name: s.input.name, ownerName: s.input.ownerName, phone: s.input.phone,
    city: s.input.city, district: s.input.district, address: s.input.address,
  })), [mine]);
}

/**
 * Что держит заказ из очереди: null — ничего (магазин настоящий);
 * «waiting» — магазин ещё не ушёл; «blocked» — магазин отвергнут или пропал,
 * и заказ сам не уйдёт.
 *
 * loaded — прочитана ли очередь магазинов с диска. На холодном старте она
 * читается позже экрана, и пустой список значил «пропал»: у всех заказов на
 * новые точки стояло «не уйдёт» с кнопкой «Удалить», и агент удалял рабочий
 * заказ. Пока не прочитано — ждёт.
 */
export function orderShopWait(shopId: number, shops: PendingShop[], loaded: boolean): null | "waiting" | "blocked" {
  if (!isLocalShopId(shopId)) return null;
  if (!loaded) return "waiting";
  const s = shops.find(x => x.localId === shopId);
  return s && !isRejectedShop(s) ? "waiting" : "blocked";
}
