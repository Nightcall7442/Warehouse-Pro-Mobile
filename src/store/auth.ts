import { create } from "zustand";
import { SecureStore } from "../storage";
import { getMe, login as apiLogin, logout as apiLogout, User } from "../api";

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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync("session_token");
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      const user = await getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      console.error('Session hydration failed:', e);
      await SecureStore.deleteItemAsync("session_token").catch(() => {});
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
    const token = await SecureStore.getItemAsync("session_token");
    if (!token) return false;

    try {
      const user = await getMe();
      set({ user, isAuthenticated: true });
      return true;
    } catch {
      await SecureStore.deleteItemAsync("session_token").catch(() => {});
      return false;
    }
  },

  logout: async () => {
    try { await apiLogout(); } catch {}
    set({ user: null, isAuthenticated: false });
  },

  // Locally patch the user object after a successful profile edit (name/phone/etc.)
  // so screens reading `user` from this store see the change immediately —
  // this store, not react-query, is the source of truth for the logged-in user.
  updateUser: (patch) => {
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user }));
  },
}));