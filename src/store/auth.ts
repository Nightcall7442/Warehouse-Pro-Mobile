import { create } from "zustand";
import { SecureStore } from "../storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMe, login as apiLogin, logout as apiLogout, API_BASE, User } from "../api";
import { sweepDrafts } from "../lib/user-draft";
import { forgetOtherOwnersCopies } from "../lib/offline-copy";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantId?: number, code?: string) => Promise<void>;
  loginWithBiometric: () => Promise<boolean>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
}

/** Decode JWT payload without verification (expiry check only) */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/** Attempt to silently refresh the session token. Returns new token or null. */
async function tryRefreshToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/refresh-token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.token ?? null;
  } catch {
    return null;
  }
}

const TOKEN_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // Refresh 24h before expiry

/** Last known profile, so a session survives opening the app without signal. */
const CACHED_USER_KEY = "cached_user";

/**
 * Did the server actually reject this session, or did we just fail to reach it?
 *
 * Only the first justifies throwing the token away. Agents work in places with
 * no signal, and treating "request failed" as "you are logged out" is what made
 * them re-enter their password most mornings: getMe() throws the same way for a
 * dead connection as for an expired token, and hydrate() deleted the token on
 * any throw at all.
 *
 * axios sets `response` only when a reply came back. No response means the
 * request never landed — DNS, timeout, airplane mode — and the token is very
 * probably still perfectly valid.
 */
function isAuthRejection(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

async function readCachedUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

/**
 * Номер человека из профиля на телефоне: null — профиля нет, undefined — не
 * прочитался (связка ключей iPhone заперта, пока экран заблокирован).
 *
 * Нужен очередям, чтобы привязать записи прежних сборок без хозяина
 * (adoptOwnerless в store/offline). Два «нет» различаются намеренно: «профиля
 * нет» — запись ничья навсегда, «не прочитался» — решать рано.
 */
export async function cachedProfileId(): Promise<number | null | undefined> {
  let raw: string | null;
  try { raw = await SecureStore.getItemAsync(CACHED_USER_KEY); } catch { return undefined; }
  try {
    const id = raw ? (JSON.parse(raw) as { id?: unknown }).id : null;
    return typeof id === "number" ? id : null;
  } catch { return null; }
}

/**
 * Номер хозяина точек GPS — рядом с профилем, но в AsyncStorage.
 *
 * Фоновая задача узнавала хозяина из SecureStore, а связка ключей iPhone по
 * умолчанию закрыта, пока экран заблокирован, — то есть ровно тогда, когда
 * телефон в кармане и GPS работает. Чтение бросало, хозяина не было, и вся
 * пачка точек выбрасывалась. Номер человека — не секрет. Пишется и стирается
 * там же, где профиль, читается в backgroundLocation.ts (sessionOwner).
 */
const GPS_OWNER_KEY = "gps_owner";

/**
 * Записи прежних сборок, так и не получившие хозяина, — уходящему профилю.
 *
 * Хозяина им даёт чтение очереди по профилю на телефоне (adoptOwnerless в
 * store/offline). Но на iPhone с запертой связкой ключей профиль не читается,
 * и запись остаётся ничьей до следующего чтения — а к нему профиль мог стать
 * чужим: вошёл Б, и заказ агента А ушёл бы под Б. Поэтому, пока профиль ещё
 * прежний, ничьё отдаётся ему. Не прочитался и сейчас — вошедшему; нет и
 * его — никому (NO_OWNER): другому человеку запись не достаётся никогда.
 */
async function settleOwnerlessWork(): Promise<void> {
  try {
    // require, а не импорт: очереди сами импортируют этот файл (так же
    // сделан backgroundLocation в stopTrackingOnSignOut).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOfflineStore, NO_OWNER } = require("./offline") as typeof import("./offline");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useVisitQueue } = require("./visit-queue") as typeof import("./visit-queue");
    const ownerId = (await cachedProfileId()) ?? useAuthStore.getState().user?.id ?? NO_OWNER;
    await Promise.all([useOfflineStore.getState().settleOwnerless(ownerId), useVisitQueue.getState().settleOwnerless(ownerId)]);
  } catch (e) {
    if (__DEV__) console.warn("Не удалось привязать записи без хозяина:", e); // i18n-ignore: журнал разработчика, не экран
  }
}

async function writeCachedUser(user: User | null): Promise<void> {
  // Профиль стирается (вход другого, выход, отказ сессии) — ничьё сперва ему.
  if (!user) await settleOwnerlessWork();
  try {
    if (user) await SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user));
    else await SecureStore.deleteItemAsync(CACHED_USER_KEY);
  } catch { /* cache is best-effort */ }
  await (user ? AsyncStorage.setItem(GPS_OWNER_KEY, String(user.id)) : AsyncStorage.removeItem(GPS_OWNER_KEY)).catch(() => {});
}


/**
 * Стереть кэши, показанные предыдущему пользователю.
 *
 * Здесь только то, что можно получить заново. Очереди отправки не входят: они
 * содержат работу, которой ещё нет на сервере.
 *
 * Экспортируется, потому что сессия заканчивается не только через logout().
 * Куда чаще она просто перестаёт действовать: токен истёк, учётку отозвали — и
 * перехватчик ответа 401 (src/api.ts) гасит сессию, минуя эту функцию.
 *
 * Черновики заказа и визита больше не стираются: они лежат под номером
 * человека (lib/user-draft), чужой их не найдёт, а свой после повторного
 * входа продолжит. Раньше 401 от истёкшего токена стирал мерчандайзеру
 * чек-лист на двести позиций. Уходят только старые ключи без человека и
 * просроченные.
 */
export async function clearUserScopedCaches(): Promise<void> {
  const exact = ["cached_products", "recent_shops"];
  for (const key of exact) {
    await AsyncStorage.removeItem(key).catch(() => {});
  }
  await sweepDrafts();
}

/**
 * Снять с телефона фоновый сбор координат вместе с уходящим агентом.
 *
 * Телефон в поле сменный. Выход из аккаунта не трогал ни фоновую задачу, ни
 * флаг автотрекинга: уведомление «Геолокация активна» продолжало висеть, точки
 * снимались каждые 50 м / 2 мин у человека, который уже не в системе, и
 * первая же удачная отправка у СЛЕДУЮЩЕГО вошедшего заливала их под его
 * сессией: сервер берёт автора из токена.
 *
 * Буфер точек при этом НЕ стирается. Раньше стирался — и 401 от истёкшего
 * токена уносил тому же агенту до трёх часов маршрута без связи: дыра на
 * карте, антифрод «не был». Теперь каждая точка помечена владельцем, и
 * flushPendingLocations отправляет только точки вошедшего; чужие ждут своего
 * человека (backgroundLocation.ts). Точки прежней версии, без хозяина,
 * получают хозяина по профилю, если он ещё лежит (401), иначе уходят:
 * см. settleUnownedPoints.
 */
export async function stopTrackingOnSignOut(): Promise<void> {
  try {
    // Загружается по требованию: модуль тянет нативные expo-task-manager,
    // expo-location и expo-battery, а этот файл импортируется отовсюду.
    // Обычный импорт затащил бы их в каждый экран и в каждый тест.
    //
    // Именно require, а не динамический import: последний в тестовой среде не
    // работает без отдельного флага узла, и остановка трекинга там молча не
    // выполнялась бы — то есть проверять было бы нечего. Так же сделан
    // отложенный доступ к этому файлу из src/api.ts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stopBackgroundTracking, settleUnownedPoints } = require("../backgroundLocation") as typeof import("../backgroundLocation");
    await stopBackgroundTracking();
    // Сначала остановить задачу, потом чистить: иначе она допишет точку после.
    await settleUnownedPoints();
  } catch (e) {
    if (__DEV__) console.warn("Не удалось остановить фоновый трекинг при выходе:", e); // i18n-ignore: журнал разработчика, не экран
  }
  // Иначе экран GPS у следующего вошедшего сам включит трекинг по чужому
  // флагу, ничего не спросив.
  await AsyncStorage.removeItem("gps_auto_track").catch(() => {});
}

/**
 * Сессию отозвал сервер (401/403): погасить сессию и фоновый GPS.
 *
 * Пути отзыва три — перехватчик 401 в api.ts, hydrate() и вход по
 * биометрии, — и до этого только logout() останавливал фоновый GPS. После
 * 401 задача продолжала снимать точки, и следующий вошедший на том же
 * сменном телефоне заливал чужой след под своим токеном — сервер берёт
 * автора из сессии.
 *
 * Работа человека не трогается: очереди заказов и отметок, буфер точек и
 * черновики помечены владельцем и ждут, пока он войдёт снова.
 */
export async function endSessionLocally(): Promise<void> {
  await SecureStore.deleteItemAsync("session_token").catch(() => {});
  await writeCachedUser(null);
  await clearUserScopedCaches();
  await stopTrackingOnSignOut();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      let token = await SecureStore.getItemAsync("session_token");
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Proactive token refresh: if token expires within 24h, refresh it silently
      const payload = decodeJwtPayload(token);
      if (payload?.exp) {
        const expiresAt = payload.exp * 1000;
        if (Date.now() > expiresAt - TOKEN_REFRESH_BUFFER_MS) {
          const newToken = await tryRefreshToken(token);
          if (newToken) {
            await SecureStore.setItemAsync("session_token", newToken);
            token = newToken;
          }
        }
      }

      const user = await getMe();
      await writeCachedUser(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      if (__DEV__) console.error('Session hydration failed:', e);

      // Couldn't reach the server. Keep the token and let the agent in on the
      // last known profile — the offline queue is built for exactly this, and
      // signing them out here would strand a day's orders behind a login screen
      // they can't get past without a connection.
      if (!isAuthRejection(e)) {
        const cached = await readCachedUser();
        if (cached) {
          // Заново — ради номера хозяина GPS: у поставленных до этой версии
          // его в AsyncStorage ещё нет, а без связи getMe выше не ответил.
          await writeCachedUser(cached);
          set({ user: cached, isAuthenticated: true, isLoading: false });
          return;
        }
        // No cached profile to fall back on, but the token is still probably
        // good — leave it in place so a later retry can use it.
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      await endSessionLocally();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password, tenantId, code) => {
    // Вход чистит кэши предыдущей сессии независимо от того, чем она
    // закончилась: через logout() — далеко не всегда, чаще токен просто
    // перестаёт действовать, и перехватчик 401 уводит на логин, минуя logout.
    // Чистится до запроса: даже если сеть отвалится посередине, чужого на
    // телефоне уже нет.
    await clearUserScopedCaches();
    // Профиль прежнего человека — тоже до запроса. По нему буфер GPS решает,
    // чьи точки отправлять (backgroundLocation.ts): между новым токеном и
    // записью нового профиля точки прежнего ушли бы под чужим токеном.
    await writeCachedUser(null);
    // И фоновый GPS предыдущего человека: если его сессия кончилась не через
    // logout(), задача всё ещё копит точки, и первая же удачная отправка
    // нового вошедшего залила бы их под его именем.
    await stopTrackingOnSignOut();

    const result = await apiLogin(email, password, tenantId, code);

    if (result?.user) {
      await writeCachedUser(result.user);
      // Копии каталога прежних людей — вон (lib/offline-copy); их работа остаётся.
      await forgetOtherOwnersCopies(result.user.id);
      set({ user: result.user, isAuthenticated: true });
    } else {
      throw new Error('No user data in response');
    }
  },

  loginWithBiometric: async () => {
    let token = await SecureStore.getItemAsync("session_token");
    if (!token) return false;

    try {
      // Proactive refresh on biometric login too
      const payload = decodeJwtPayload(token);
      if (payload?.exp) {
        const expiresAt = payload.exp * 1000;
        if (Date.now() > expiresAt - TOKEN_REFRESH_BUFFER_MS) {
          const newToken = await tryRefreshToken(token);
          if (newToken) {
            await SecureStore.setItemAsync("session_token", newToken);
            token = newToken;
          }
        }
      }

      const user = await getMe();
      await writeCachedUser(user);
      set({ user, isAuthenticated: true });
      return true;
    } catch (e) {
      if (__DEV__) console.warn("Biometric auth failed:", e);

      // Same rule as hydrate: a failed request is not a rejected session.
      if (!isAuthRejection(e)) {
        const cached = await readCachedUser();
        if (cached) {
          set({ user: cached, isAuthenticated: true });
          return true;
        }
        return false;
      }

      await endSessionLocally();
      return false;
    }
  },

  logout: async () => {
    try { await apiLogout(); }
    catch (e) { if (__DEV__) console.warn("Logout API call failed (non-blocking):", e); }
    // Deliberate sign-out, so the cached profile goes too — otherwise the next
    // launch would restore the previous user from cache.
    await writeCachedUser(null);

    // Всё, что показывалось предыдущему пользователю, уходит вместе с ним.
    //
    // Телефон в поле часто общий: агент сдаёт смену и передаёт его сменщику.
    // Без этой очистки следующий вошедший первые секунды видел чужой каталог и
    // чужие недавние магазины. Черновики заказа и визита лежат под номером
    // человека (lib/user-draft) — чужой их не найдёт, а свой продолжит.
    //
    // Очереди отправки и буфер точек GPS здесь НЕ трогаются намеренно. Это
    // несделанная работа, ещё не дошедшая до сервера, — и стирать её при
    // выходе значит терять смену человека. Они помечены автором (ownerId) и
    // просто ждут, пока он войдёт снова.
    await clearUserScopedCaches();

    // Фоновый сбор координат — тоже «предыдущий пользователь»: он продолжал
    // работать и после выхода, снимая точки человека, которого уже нет.
    await stopTrackingOnSignOut();

    set({ user: null, isAuthenticated: false });
  },

  // Locally patch the user object after a successful profile edit (name/phone/etc.)
  // so screens reading `user` from this store see the change immediately —
  // this store, not react-query, is the source of truth for the logged-in user.
  updateUser: (patch) => {
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user }));
  },
}));