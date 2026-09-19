import * as Battery from "expo-battery";

/**
 * Заряд в процентах — или ничего.
 *
 * expo-battery отдаёт −1, когда заряд недоступен (эмулятор, часть планшетов,
 * отказ системы). Три места умножали это на сто и слали на сервер −100 %:
 * директор видел «телефон разряжен», звонил, а телефон был в порядке.
 */
export async function batteryPercent(): Promise<number | undefined> {
  const level = await Battery.getBatteryLevelAsync().catch(() => null);
  if (level === null || level < 0) return undefined;
  return Math.round(level * 100);
}
