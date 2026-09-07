import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTenantBranding, getTenantMoneySettings } from "../api";
import { TenantTheme, useThemeStore } from "./theme";

const BRANDING_CACHE_KEY = "tenant_branding";

export interface TenantBranding {
  /** Название организации: имя из брендинга, иначе из реквизитов. */
  companyName: string;
  logoUrl: string | null;
  /** Основной цвет (#rrggbb) или null, если арендатор его не задавал. */
  primaryColor: string | null;
  mobileTheme: TenantTheme;
  currency: string;
  currencySymbol: string;
  symbolPosition: "before" | "after";
}

interface BrandingState {
  branding: TenantBranding;
  loaded: boolean;
  /** Прочитать бренд, сохранённый на устройстве. Сети не трогает. */
  load: () => Promise<void>;
  /** Запросить бренд арендатора у сервера. Только после входа. */
  refresh: () => Promise<void>;
  /** Забыть бренд предыдущего пользователя (выход). */
  clear: () => Promise<void>;
}

/**
 * Пока бренд неизвестен — умолчания приложения.
 *
 * Валюта здесь тоже стоит: до первого ответа сервера показать сумму без знака
 * нельзя, а «сум» — то, с чем приложение жило до сих пор. Дальше её заменяет
 * настройка арендатора, и на устройстве остаётся уже она.
 */
const DEFAULT_BRANDING: TenantBranding = {
  companyName: "Warehouse Pro",
  logoUrl: null,
  primaryColor: null,
  mobileTheme: "auto",
  currency: "UZS",
  currencySymbol: "сум",
  symbolPosition: "after",
};

/** Тема и цвет из бренда — в оформление приложения. */
function applyToTheme(branding: TenantBranding) {
  useThemeStore.getState().applyBranding(branding.mobileTheme, branding.primaryColor);
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  branding: DEFAULT_BRANDING,
  loaded: false,

  /*
    При запуске бренд берётся ТОЛЬКО из кэша.

    Раньше здесь же стоял запрос к серверу — к публичной процедуре, которая до
    входа не знает арендатора и всем отвечает «Warehouse Pro». То есть каждый
    запуск затирал сохранённый бренд заглушкой. Запрос переехал в refresh(),
    который зовут после входа (app/_layout.tsx), а экран входа показывает то,
    что осталось с прошлого раза, — единственное, что о бренде вообще можно
    знать до ввода пароля.
  */
  load: async () => {
    if (get().loaded) return;
    try {
      const cached = await AsyncStorage.getItem(BRANDING_CACHE_KEY);
      if (cached) {
        const branding = { ...DEFAULT_BRANDING, ...JSON.parse(cached) } as TenantBranding;
        set({ branding, loaded: true });
        applyToTheme(branding);
      }
    } catch { /* cache read failed */ }
  },

  refresh: async () => {
    // Два независимых запроса: оформление и валюта лежат в разных таблицах.
    // Падение одного не должно стирать то, что ответил другой, — поэтому
    // каждый гасит свою ошибку сам.
    const [look, money] = await Promise.all([
      getTenantBranding().catch(() => null),
      getTenantMoneySettings().catch(() => null),
    ]);
    if (!look && !money) return;

    const branding: TenantBranding = {
      companyName: look?.appName ?? money?.companyName ?? DEFAULT_BRANDING.companyName,
      logoUrl: look?.logoUrl ?? money?.logoUrl ?? null,
      primaryColor: look?.primaryColor ?? null,
      mobileTheme: look?.mobileTheme ?? DEFAULT_BRANDING.mobileTheme,
      currency: money?.currency ?? DEFAULT_BRANDING.currency,
      currencySymbol: money?.currencySymbol ?? DEFAULT_BRANDING.currencySymbol,
      symbolPosition: money?.symbolPosition ?? DEFAULT_BRANDING.symbolPosition,
    };

    set({ branding, loaded: true });
    applyToTheme(branding);
    await AsyncStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding)).catch(() => {});
  },

  /*
    Телефон в поле часто общий: агент сдаёт смену и передаёт его сменщику.
    Без этой очистки следующий вошедший видел на экране входа чужой логотип и
    чужое название — а до первого ответа сервера ещё и чужую валюту под
    суммами.
  */
  clear: async () => {
    set({ branding: DEFAULT_BRANDING, loaded: false });
    applyToTheme(DEFAULT_BRANDING);
    await AsyncStorage.removeItem(BRANDING_CACHE_KEY).catch(() => {});
  },
}));

/**
 * Сумма со знаком валюты арендатора.
 *
 * По экранам «сум» был вписан прямо в текст — организация, торгующая в другой
 * валюте, видела свои цены подписанными чужими деньгами. Читает состояние
 * напрямую (не хук), чтобы годиться и внутри разметки, и в тексте уведомления
 * или ошибки.
 */
export function formatMoney(value: string | number | null | undefined): string {
  const num = typeof value === "number"
    ? value
    : Number(String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  const { currencySymbol, symbolPosition } = useBrandingStore.getState().branding;
  const shown = Number.isFinite(num) ? num.toLocaleString("ru") : "0";
  return symbolPosition === "before" ? `${currencySymbol} ${shown}` : `${shown} ${currencySymbol}`;
}

/** Один знак валюты — для подписей вроде «Норма выручки (сум)». */
export const useCurrencySymbol = () => useBrandingStore(s => s.branding.currencySymbol);
