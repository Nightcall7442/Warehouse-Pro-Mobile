import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkColors, LightColors, ThemeColors, updateColors } from "../theme";

interface ThemeState {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: true,
  colors: DarkColors,

  loadTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem("app_theme");
      const isDark = saved !== "light";
      set({ isDark, colors: isDark ? DarkColors : LightColors });
      updateColors(isDark);
    } catch { /* theme load failed */ }
  },

  toggleTheme: () => {
    const isDark = !get().isDark;
    set({ isDark, colors: isDark ? DarkColors : LightColors });
    updateColors(isDark);
    AsyncStorage.setItem("app_theme", isDark ? "dark" : "light").catch(() => {});
  },
}));

// Convenience hook
export const useThemeColors = () => useThemeStore(s => s.colors);
