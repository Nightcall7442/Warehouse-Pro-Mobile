import { create } from "zustand";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeColors, paletteFor, setBrandPrimary, updateColors } from "../theme";

/** Что арендатор задаёт в брендинге (поле mobileTheme). */
export type TenantTheme = "light" | "dark" | "auto";

interface ThemeState {
  isDark: boolean;
  colors: ThemeColors;
  /**
   * Тема, выбранная человеком на этом телефоне. null — не выбирал.
   *
   * Раньше выбора «не выбирал» не существовало: отсутствие ключа в хранилище
   * читалось как «тёмная». С настройкой арендатора так нельзя — иначе его
   * светлая тема никогда бы не применилась, потому что приложение считало бы,
   * что пользователь уже предпочёл тёмную.
   */
  userChoice: "light" | "dark" | null;
  /** Настройка арендатора, пока брендинг не пришёл — «по системе». */
  tenantTheme: TenantTheme;
  toggleTheme: () => void;
  loadTheme: () => Promise<void>;
  /** Применить настройки арендатора: тему и основной цвет. */
  applyBranding: (tenantTheme: TenantTheme, primaryColor: string | null) => void;
}

const THEME_KEY = "app_theme";

/**
 * Системная тема телефона. null (не знаем) считаем тёмной — это то, с чем
 * приложение жило до появления настройки, и менять умолчание незачем.
 */
const systemIsDark = () => Appearance.getColorScheme() !== "light";

/** Выбор человека сильнее настройки организации; её «auto» отдаёт решение системе. */
function resolveDark(userChoice: "light" | "dark" | null, tenantTheme: TenantTheme): boolean {
  if (userChoice) return userChoice === "dark";
  if (tenantTheme === "light") return false;
  if (tenantTheme === "dark") return true;
  return systemIsDark();
}

let systemWatch: { remove: () => void } | null = null;

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: true,
  colors: paletteFor(true),
  userChoice: null,
  tenantTheme: "auto",

  loadTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      const userChoice = saved === "light" || saved === "dark" ? saved : null;
      const isDark = resolveDark(userChoice, get().tenantTheme);
      set({ userChoice, isDark, colors: paletteFor(isDark) });
      updateColors(isDark);
    } catch { /* theme load failed */ }

    // «Авто» без этого означало бы «как было в системе при запуске»: человек
    // переключает телефон на ночной режим, а приложение остаётся светлым до
    // перезапуска.
    if (!systemWatch) {
      systemWatch = Appearance.addChangeListener(() => {
        const { userChoice, tenantTheme } = get();
        if (userChoice || tenantTheme !== "auto") return;
        const isDark = systemIsDark();
        set({ isDark, colors: paletteFor(isDark) });
        updateColors(isDark);
      });
    }
  },

  toggleTheme: () => {
    const isDark = !get().isDark;
    const userChoice = isDark ? "dark" : "light";
    set({ isDark, userChoice, colors: paletteFor(isDark) });
    updateColors(isDark);
    AsyncStorage.setItem(THEME_KEY, userChoice).catch(() => {});
  },

  applyBranding: (tenantTheme, primaryColor) => {
    setBrandPrimary(primaryColor);
    const isDark = resolveDark(get().userChoice, tenantTheme);
    // Палитра пересобирается даже при той же теме: цвет бренда мог смениться.
    set({ tenantTheme, isDark, colors: paletteFor(isDark) });
    updateColors(isDark);
  },
}));

// Convenience hook
export const useThemeColors = () => useThemeStore(s => s.colors);
