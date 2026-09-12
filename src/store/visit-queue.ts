import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./auth";
import { errorText } from "../lib/error-text";
import { isRetryableError, uuidv4 } from "./offline";
import { updatePlanStatus, saveVisitPhoto, uploadFile, type Plan } from "../api";
import { preparePhoto } from "../lib/prepare-photo";

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

/** Только своё и только не отправленное: телефон в поле бывает общим. */
function mine(a: VisitAction, userId: number | undefined): boolean {
  if (a.synced) return false;
  if (a.retryable === false) return false;
  return a.ownerId === undefined || userId === undefined || a.ownerId === userId;
}

async function send(a: VisitAction): Promise<void> {
  if (a.photoUri) {
    const { dataUrl } = await preparePhoto(a.photoUri);
    const url = await uploadFile(dataUrl, "visits");
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
      for (const a of pending) {
        // Не дошли до отправки — обратно в ожидание, без пометки об ошибке.
        if (networkDown) { outcome.set(a.id, { status_: "pending" }); continue; }
        try {
          await send(a);
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
