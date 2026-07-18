import { Platform } from 'react-native';

// Единый SecureStore для всего приложения
export const SecureStore = Platform.OS === 'web'
  ? {
      getItemAsync: async (key: string): Promise<string | null> => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItemAsync: async (key: string, value: string): Promise<void> => {
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          console.error('SecureStore.setItemAsync failed:', e);
        }
      },
      deleteItemAsync: async (key: string): Promise<void> => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.error('SecureStore.deleteItemAsync failed:', e);
        }
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('expo-secure-store');