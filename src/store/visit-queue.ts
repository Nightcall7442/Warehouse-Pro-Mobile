import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./auth";
import { errorText } from "../lib/error-text";
import { isRetryableError, shouldAutoSync, uuidv4 } from "./offline";
import { updatePlanStatus, saveVisitPhoto, uploadFile, type Plan } from "../api";
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
  add: (a: Omit<VisitAction, "id" | "createdAt" | "synced">) => Promise<boolean>;
  sync: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => Promise<void>;
}

/** Только своё и только не отправленное: телефон в поле бывает общим (правило — одно на все очереди). */
const mine = shouldAutoSync;

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
async function send(a: VisitAction): Promise<string | undefined> {
  let url = a.photoUrl;
  if (a.photoUri && !url) {
    let dataUrl: string;
    try {
      ({ dataUrl } = await preparePhoto(a.photoUri));
    } catch {
      await updatePlanStatus(a.planId, a.status);
      return tt("Снимок пропал с телефона — визит отмечен без фото", "Rasm telefondan yo'qolgan — tashrif rasmsiz belgilandi");
    }
    url = await uploadFile(dataUrl, "visits");
  }
  if (url) {
    await saveVisitPhoto(a.planId, url);
    return;
  }
  await updatePlanStatus(a.planId, a.status);
}

export const useVisitQueue = create<VisitQueue>((set, get) => ({
  actions: [],
  loaded: false,
  syncing: false,

  load: async () => { set({ actions: await read(), loaded: true }); },

  add: async (a) => {
    const entry: VisitAction = {
      ...a, id: uuidv4(), createdAt: new Date().toISOString(), synced: false,
      ownerId: a.ownerId ?? useAuthStore.getState().user?.id, status_: "pending",
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
      const pending = get().actions.filter(a => mine(a, userId)).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      if (pending.length === 0) return { synced: 0, failed: 0 };

      let synced = 0, failed = 0, networkDown = false;
      const outcome = new Map<string, Partial<VisitAction>>();
      const warnings = new Set<string>();
      for (const a of pending) {
        // Не дошли до отправки — обратно в ожидание, без пометки об ошибке.
        if (networkDown) { outcome.set(a.id, { status_: "pending" }); continue; }
        try {
          const warning = await send(a);
          if (warning) warnings.add(warning);
          synced++;
          outcome.set(a.id, { synced: true, status_: "pending", error: undefined });
        } catch (e) {
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
    const actions = get().actions.filter(a => a.id !== id);
    set({ actions });
    await write(actions);
  },
}));
