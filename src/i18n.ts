import { useCallback } from "react";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

/**
 * Язык приложения: русский или узбекский (латиница).
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Веб переведён целиком, телефон — нет: ни словаря, ни переключателя, все
 * строки кириллицей. А телефон — рабочий инструмент именно тех ролей, кому
 * русский труднее всего: агент, курьер, мерчандайзер. «Заказ НЕ сохранён»,
 * «Не доставлено?», «Записано на телефоне» — тексты, от которых зависят
 * деньги, читались на чужом языке.
 *
 * ── Почему пары, а не словарь ───────────────────────────────────────────────
 *
 * Тот же приём, что в вебе для экранов арендатора: t("по-русски",
 * "o'zbekcha") прямо в месте использования. Перевод виден рядом с текстом,
 * пропущенная строка видна в коде, ключи придумывать не надо. Бумага (печать,
 * Excel) остаётся русской — это правило веба, здесь бумаги нет.
 *
 * Выбор хранится на телефоне: организация одна, а люди в ней говорят на
 * разных языках. Пока человек не выбирал — по языку телефона.
 */
export type Lang = "ru" | "uz";

const LANG_KEY = "app_lang";

function deviceLang(): Lang {
  try {
    const tag: string | undefined =
      Platform.OS === "ios"
        ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : Platform.OS === "android"
          ? NativeModules.I18nManager?.localeIdentifier
          : (typeof navigator !== "undefined" ? navigator.language : undefined);
    return String(tag ?? "").toLowerCase().startsWith("uz") ? "uz" : "ru";
  } catch {
    return "ru";
  }
}

interface LangState {
  lang: Lang;
  /** Человек выбирал сам — тогда язык телефона больше не учитывается. */
  chosen: boolean;
  setLang: (lang: Lang) => Promise<void>;
  loadLang: () => Promise<void>;
}

export const useLangStore = create<LangState>((set) => ({
  lang: deviceLang(),
  chosen: false,
  setLang: async (lang) => {
    set({ lang, chosen: true });
    try { await AsyncStorage.setItem(LANG_KEY, lang); } catch { /* не записалось — до перезапуска язык всё равно выбранный */ }
  },
  loadLang: async () => {
    try {
      const saved = await AsyncStorage.getItem(LANG_KEY);
      if (saved === "ru" || saved === "uz") set({ lang: saved, chosen: true });
    } catch { /* нет хранилища — остаёмся на языке телефона */ }
  },
}));

/** Текущий язык вне компонентов (очереди, тосты, разбор ошибок). */
export function currentLang(): Lang {
  return useLangStore.getState().lang;
}

/** Пара для кода вне React: тосты из store, тексты ошибок в lib. */
export const tt = (ru: string, uz: string): string => (currentLang() === "uz" ? uz : ru);

/** Пара внутри компонента: перерисовывается при смене языка. */
export function useT(): (ru: string, uz: string) => string {
  const lang = useLangStore((s) => s.lang);
  return useCallback((ru: string, uz: string) => (lang === "uz" ? uz : ru), [lang]);
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}
