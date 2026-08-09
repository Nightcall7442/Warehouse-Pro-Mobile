import { Platform } from 'react-native';

// Единый SecureStore для всего приложения
// Web: sessionStorage (cleared on tab close) — safer than localStorage against XSS
// Native: expo-secure-store (hardware-backed keychain)
export const SecureStore = Platform.OS === 'web'
  ? {
      getItemAsync: async (key: string): Promise<string | null> => {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItemAsync: async (key: string, value: string): Promise<void> => {
        try {
          sessionStorage.setItem(key, value);
        } catch (e) {
          if (__DEV__) console.error('SecureStore.setItemAsync failed:', e);
        }
      },
      deleteItemAsync: async (key: string): Promise<void> => {
        try {
          sessionStorage.removeItem(key);
        } catch (e) {
          if (__DEV__) console.error('SecureStore.deleteItemAsync failed:', e);
        }
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('expo-secure-store');