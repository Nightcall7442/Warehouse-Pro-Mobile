import { create } from "zustand";
import { SecureStore } from "../storage";
import { getMe, login as apiLogin, logout as apiLogout, API_BASE, User } from "../api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
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
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      if (__DEV__) console.error('Session hydration failed:', e);
      await SecureStore.deleteItemAsync("session_token").catch((err: unknown) => { if (__DEV__) console.warn("Failed to clear invalid token:", err); });
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const result = await apiLogin(email, password);

    if (result?.user) {
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
      set({ user, isAuthenticated: true });
      return true;
    } catch (e) {
      if (__DEV__) console.warn("Biometric auth failed:", e);
      await SecureStore.deleteItemAsync("session_token").catch((err: unknown) => { if (__DEV__) console.warn("Failed to clear invalid token:", err); });
      return false;
    }
  },

  logout: async () => {
    try { await apiLogout(); }
    catch (e) { if (__DEV__) console.warn("Logout API call failed (non-blocking):", e); }
    set({ user: null, isAuthenticated: false });
  },

  // Locally patch the user object after a successful profile edit (name/phone/etc.)
  // so screens reading `user` from this store see the change immediately —
  // this store, not react-query, is the source of truth for the logged-in user.
  updateUser: (patch) => {
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user }));
  },
}));