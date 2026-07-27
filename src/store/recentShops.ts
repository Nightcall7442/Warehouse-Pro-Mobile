import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_SHOPS_KEY = "recent_shops";
const MAX_RECENT = 5;

export async function getRecentShopIds(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SHOPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addRecentShop(shopId: number): Promise<void> {
  try {
    const current = await getRecentShopIds();
    const filtered = current.filter(id => id !== shopId);
    const updated = [shopId, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_SHOPS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}
