import { create } from "zustand";
import { SecureStore } from "../storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMe, login as apiLogin, logout as apiLogout, API_BASE, User } from "../api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantId?: number) => Promise<void>;
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

async function writeCachedUser(user: User | null): Promise<void> {
  try {
    if (user) await SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user));
    else await SecureStore.deleteItemAsync(CACHED_USER_KEY);
  } catch { /* cache is best-effort */ }
}


/**
 * Стереть данные, показанные предыдущему пользователю.
 *
 * Здесь только кэши и черновики — то, что можно получить заново. Очереди
 * отправки не входят: они содержат работу, которой ещё нет на сервере.
 */
async function clearUserScopedCaches(): Promise<void> {
  const exact = ["cached_products", "recent_shops", "order_draft"];
  for (const key of exact) {
    await AsyncStorage.removeItem(key).catch(() => {});
  }
  // Черновики отчётов о визите лежат под ключом с номером плана, поэтому
  // перечислить их заранее нельзя — они ищутся по началу имени.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const drafts = keys.filter(k => k.startsWith("visit_draft_"));
    if (drafts.length > 0) await AsyncStorage.multiRemove(drafts);
  } catch { /* хранилище недоступно — выход всё равно должен состояться */ }
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
          set({ user: cached, isAuthenticated: true, isLoading: false });
          return;
        }
        // No cached profile to fall back on, but the token is still probably
        // good — leave it in place so a later retry can use it.
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      await SecureStore.deleteItemAsync("session_token").catch((err: unknown) => { if (__DEV__) console.warn("Failed to clear invalid token:", err); });
      await writeCachedUser(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password, tenantId) => {
    const result = await apiLogin(email, password, tenantId);

    if (result?.user) {
      await writeCachedUser(result.user);
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

      await SecureStore.deleteItemAsync("session_token").catch((err: unknown) => { if (__DEV__) console.warn("Failed to clear invalid token:", err); });
      await writeCachedUser(null);
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
    // Без этой очистки следующий вошедший первые секунды видел чужой каталог,
    // чужие недавние магазины и мог открыть чужой недописанный заказ или отчёт
    // о визите.
    //
    // Очереди отправки здесь НЕ трогаются намеренно. Это несделанная работа —
    // заказы и действия курьера, ещё не дошедшие до сервера, — и стирать её при
    // выходе значит терять смену человека. Они помечены автором (ownerId) и
    // просто ждут, пока он войдёт снова.
    await clearUserScopedCaches();

    set({ user: null, isAuthenticated: false });
  },

  // Locally patch the user object after a successful profile edit (name/phone/etc.)
  // so screens reading `user` from this store see the change immediately —
  // this store, not react-query, is the source of truth for the logged-in user.
  updateUser: (patch) => {
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user }));
  },
}));