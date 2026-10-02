import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./auth";
import { errorText } from "../lib/error-text";
import { adoptOwnerless, giveOwnerless, isOwnedBy, isRetryableError, shouldAutoSync, uuidv4 } from "./offline";
import { updatePlanStatus, saveVisitPhoto, uploadFile, type Plan, type NoOrderChoice } from "../api";
import { preparePhoto } from "../lib/prepare-photo";
import { notify } from "./toast";
import { tt } from "../i18n";

/*
  Третья очередь: отметки визитов и фото.

  Заказы и отметки курьера без связи откладывались и уходили сами; визит —
  нет. Агент в подвале магазина жал «посещён», получал «Network Error», и
  визит оставался неотмеченным: план на день показывал пропуск, KPI считал
  прогул, антифрод — «не был». Здесь отметка (и снимок, если он был)
  ложится в очередь и уходит при первой связи, по одной и по порядку.

  Снимок хранится ссылкой на файл камеры, а не base64 в AsyncStorage: у
  хранилища предел в единицы мегабайт, и день из двадцати фото в него бы не
  влез. Файл готовится и грузится при отправке.
*/

export interface VisitAction {
  id: string;
  planId: number;
  status: Plan["status"];
  /** Локальный файл снимка (из камеры); грузится при отправке. */
  photoUri?: string;
  /** Снимок уже в хранилище, а привязка к визиту сорвалась по сети: осталось привязать. */
  photoUrl?: string;
  planName?: string;
  /**
   * Почему визит без заказа — выбрано на экране до отметки и уходит вместе с
   * ней, тем же запросом. Отдельной записи нет: повтор отметки повторяет и
   * причину (сервер просто перезапишет то же), а потерять её отдельно от
   * визита нельзя.
   */
  noOrder?: NoOrderChoice;
  createdAt: string;
  ownerId?: number;
  synced: boolean;
  status_?: "pending" | "syncing" | "failed";
  error?: string;
  retryable?: boolean;
}

const KEY = "pending_visit_actions";

async function read(): Promise<VisitAction[]> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? (JSON.parse(raw) as VisitAction[]) : []; }
  catch { return []; }
}
async function write(list: VisitAction[]): Promise<boolean> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch { return false; }
}

interface VisitQueue {
  actions: VisitAction[];
  loaded: boolean;
  syncing: boolean;
  load: () => Promise<void>;
  /** Записи без хозяина — этому хозяину (см. одноимённое в store/offline). */
  settleOwnerless: (ownerId: number) => Promise<void>;
  add: (a: Omit<VisitAction, "id" | "createdAt" | "synced">) => Promise<boolean>;
  sync: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => Promise<void>;
  /** Отвергнутую сервером запись — снова в очередь и сразу в проход (причину могли исправить в офисе). */
  retry: (id: string) => Promise<void>;
}

/** Только своё и только не отправленное: телефон в поле бывает общим (правило — одно на все очереди). */
const mine = shouldAutoSync;

/** Запись есть и она вошедшего. */
function ownedNow(actions: VisitAction[], id: string): boolean {
  const a = actions.find(x => x.id === id);
  return !!a && isOwnedBy(a, useAuthStore.getState().user?.id);
}

/**
 * Вошедший сменился посреди прохода — запись не отправлена и ждёт хозяина.
 *
 * Токен подставляется в момент каждого запроса (src/api.ts), а у одной записи
 * их до двух: снимок и привязка. Снимок висел на слабой связи, А вышел, вошёл
 * Б — и привязка уходила токеном Б: визит А записывался на Б. Поэтому
 * вошедший сверяется перед каждым запросом, а не раз на проход.
 */
const OWNER_GONE = new Error("owner gone");

/** Причина «без заказа» — только если выбрана: отметка без неё уходит ровно как раньше. */
function reason(a: VisitAction): [] | [NoOrderChoice] {
  return a.noOrder ? [a.noOrder] : [];
}
function ensure(still: () => boolean): void {
  if (!still()) throw OWNER_GONE;
}

/**
 * Отправить одну запись. Возвращает предупреждение, если визит ушёл без снимка.
 *
 * Снимок лежит ссылкой на файл в кэше камеры, а кэш система чистит сама, когда
 * место кончается. Раньше пропавший файл ронял preparePhoto не-сетевой ошибкой,
 * запись получала retryable:false и исчезала из прохода навсегда — вместе с
 * визитом, который так и оставался неотмеченным. Визит важнее фото: без файла
 * отметка уходит обычным путём, а агент узнаёт, что снимок пропал.
 *
 * Отказ сервера на сам снимок (подлог, битые данные) на отметку НЕ
 * подменяется: у saveVisitPhoto есть проверка на подлог, у updatePlanStatus нет.
 */
async function send(a: VisitAction, still: () => boolean): Promise<string | undefined> {
  let url = a.photoUrl;
  if (a.photoUri && !url) {
    let dataUrl: string;
    try {
      ({ dataUrl } = await preparePhoto(a.photoUri));
    } catch {
      ensure(still);
      await updatePlanStatus(a.planId, a.status, a.createdAt, ...reason(a));
      return tt("Снимок пропал с телефона — визит отмечен без фото", "Rasm telefondan yo'qolgan — tashrif rasmsiz belgilandi");
    }
    ensure(still);
    url = await uploadFile(dataUrl, "visits");
    // Загруженное запоминается сразу, как у магазинов (shop-queue): сменись
    // вошедший до привязки — повтор не погонит снимок по слабой связи второй раз.
    const actions = useVisitQueue.getState().actions.map(x => (x.id === a.id ? { ...x, photoUrl: url } : x));
    useVisitQueue.setState({ actions });
    await write(actions);
  }
  ensure(still);
  // Время отметки — из очереди: визит стоит в журнале тогда, когда был.
  if (url) {
    await saveVisitPhoto(a.planId, url, undefined, a.createdAt, ...reason(a));
    return;
  }
  await updatePlanStatus(a.planId, a.status, a.createdAt, ...reason(a));
}

export const useVisitQueue = create<VisitQueue>((set, get) => ({
  actions: [],
  loaded: false,
  syncing: false,

  load: async () => {
    const actions = await read();
    // Отметки прежних сборок без хозяина — хозяину по профилю или никому (см. adoptOwnerless).
    const own = await adoptOwnerless(actions);
    set({ actions: own ?? actions, loaded: true });
    if (own) await write(own);
  },

  settleOwnerless: async (ownerId) => {
    // Не прочитанная ещё очередь в памяти пуста: запись поверх стёрла бы диск.
    if (!get().loaded) await get().load();
    const actions = giveOwnerless(get().actions, ownerId);
    if (!actions) return;
    set({ actions });
    await write(actions);
  },

  add: async (a) => {
    // Хозяин снят экраном до запроса: отметка ложится из onError, а при 401
    // вошедшего к этому моменту уже нет (см. addOrder в store/offline).
    // Без хозяина — отказ: иначе визит агента А отметил бы сменщик Б.
    const ownerId = a.ownerId ?? useAuthStore.getState().user?.id;
    if (ownerId == null) return false;
    const entry: VisitAction = {
      ...a, id: uuidv4(), createdAt: new Date().toISOString(), synced: false,
      ownerId, status_: "pending",
    };
    const actions = [...get().actions, entry];
    set({ actions });
    return write(actions);
  },

  sync: async () => {
    if (get().syncing) return { synced: 0, failed: 0 };
    set({ syncing: true });
    try {
      const userId = useAuthStore.getState().user?.id;
      const still = () => useAuthStore.getState().user?.id === userId;
      const pending = get().actions.filter(a => mine(a, userId)).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      if (pending.length === 0) return { synced: 0, failed: 0 };

      let synced = 0, failed = 0, networkDown = false;
      const outcome = new Map<string, Partial<VisitAction>>();
      const warnings = new Set<string>();
      for (const a of pending) {
        // Не дошли до отправки — обратно в ожидание, без пометки об ошибке.
        // Вошедшего сверяет send перед каждым своим запросом (ensure).
        if (networkDown) { outcome.set(a.id, { status_: "pending" }); continue; }
        try {
          const warning = await send(a, still);
          if (warning) warnings.add(warning);
          synced++;
          outcome.set(a.id, { synced: true, status_: "pending", error: undefined });
        } catch (e) {
          // Вход сменился между снимком и привязкой — запись ждёт хозяина, без ошибки.
          if (e === OWNER_GONE) { outcome.set(a.id, { status_: "pending" }); continue; }
          failed++;
          const retryable = isRetryableError(e);
          outcome.set(a.id, { status_: "failed", error: errorText(e), retryable });
          if (retryable) networkDown = true;
        }
      }
      // Сливаем с тем, что добавили, пока шёл проход; отправленное — вон из очереди.
      const merged = get().actions
        .map(a => (outcome.has(a.id) ? { ...a, ...outcome.get(a.id) } : a))
        .filter(a => !a.synced);
      set({ actions: merged });
      await write(merged);
      warnings.forEach(w => notify.warning(w));
      return { synced, failed };
    } finally {
      set({ syncing: false });
    }
  },

  remove: async (id) => {
    // Убрать и повторить можно только своё — как у отметок курьера
    // (discardDeliveryAction): на сменном телефоне Б иначе стирал визит А.
    if (!ownedNow(get().actions, id)) return;
    const actions = get().actions.filter(a => a.id !== id);
    set({ actions });
    await write(actions);
  },

  retry: async (id) => {
    if (!ownedNow(get().actions, id)) return;
    const actions = get().actions.map(a => (a.id === id ? { ...a, retryable: undefined, status_: "pending" as const, error: undefined } : a));
    set({ actions });
    await write(actions);
    void get().sync();
  },
}));
