import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TenantBranding, getBranding } from "../api";

const BRANDING_CACHE_KEY = "tenant_branding";

interface BrandingState {
  branding: TenantBranding;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_BRANDING: TenantBranding = {
  companyName: "Warehouse Pro",
  logoUrl: null,
  currency: "UZS",
  currencySymbol: "сум",
};

export const useBrandingStore = create<BrandingState>((set, get) => ({
  branding: DEFAULT_BRANDING,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const cached = await AsyncStorage.getItem(BRANDING_CACHE_KEY);
      if (cached) {
        set({ branding: JSON.parse(cached), loaded: true });
      }
      // Also fetch fresh data in background
      get().refresh();
    } catch { /* cache read failed */ }
  },

  refresh: async () => {
    try {
      const fresh = await getBranding();
      set({ branding: fresh, loaded: true });
      await AsyncStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(fresh));
    } catch { /* refresh failed */ }
  },
}));

// Convenience hook
export const useCurrency = () => useBrandingStore(s => ({
  symbol: s.branding.currencySymbol,
  code: s.branding.currency,
  format: (val: number, locale?: string) => `${val.toLocaleString(locale ?? "ru")} ${s.branding.currencySymbol}`,
}));
