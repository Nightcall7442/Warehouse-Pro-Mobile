import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuthStore } from "../store/auth";
import { useLockStore } from "../store/lock";
import { SecureStore } from "../storage";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Persisted, not just an in-memory ref — a ref resets to null whenever the OS
 * kills the app in the background (routine on Android, and expected on a
 * phone shared across shifts). Without persistence, reopening a killed app
 * always measured elapsed-time-in-background as 0 and skipped the lock
 * entirely, no matter how many hours had actually passed.
 */
const BACKGROUNDED_AT_KEY = "auto_lock_backgrounded_at";

/** Тот же ключ, которым useBiometricAuth помечает включённую пользователем биометрию. */
const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

/**
 * Готово ли устройство подтвердить личность прямо сейчас.
 *
 * Три условия, и все обязательны. Раньше проверялось только наличие датчика, с
 * расчётом на то, что authenticateAsync сам откатится к PIN устройства. На
 * телефоне без зарегистрированного отпечатка И без PIN — обычное дело для
 * рабочего аппарата, который передают по смене, — откатываться оказывалось не
 * на что: вызов немедленно возвращал success:false, а прежний код на этом
 * месте вызывал logout(). То есть агента выбрасывало из аккаунта при каждом
 * возвращении в приложение.
 *
 * Проверяется и то, включил ли биометрию сам пользователь: экран профиля
 * предлагает её как настройку, а блокировка раньше работала независимо от
 * этого выбора.
 */
async function lockAvailable(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    if (enabled !== "true") return false;
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    // Не смогли выяснить — значит блокировать нечем. Запирать дверь, ключа от
    // которой нет, хуже, чем не запирать.
    return false;
  }
}

/**
 * Запереть экран после долгого простоя.
 *
 * Хук только ставит признак блокировки; спрашивает отпечаток и снимает её
 * LockScreen. Разделение намеренное: попытка подтверждения должна быть
 * повторяемой, а хук срабатывает один раз на возвращение из фона.
 *
 * Чего этот хук больше НЕ делает — так это не выходит из аккаунта. Неудачное
 * подтверждение оставляет сессию нетронутой: человек остаётся заблокированным
 * и может попробовать снова. Выход есть, но только кнопкой, которую нажимают
 * осознанно.
 */
export function useAutoLock() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const lock = useLockStore((s) => s.lock);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      // App going to background → record timestamp
      if (prev === "active" && nextState !== "active") {
        await AsyncStorage.setItem(BACKGROUNDED_AT_KEY, String(Date.now())).catch(() => {});
        return;
      }

      // App returning to foreground → check idle duration
      if (prev !== "active" && nextState === "active") {
        const stored = await AsyncStorage.getItem(BACKGROUNDED_AT_KEY).catch(() => null);
        const elapsed = stored ? Date.now() - Number(stored) : 0;
        await AsyncStorage.removeItem(BACKGROUNDED_AT_KEY).catch(() => {});

        if (elapsed < IDLE_TIMEOUT_MS) return;
        if (!(await lockAvailable())) return;

        lock();
      }
    });

    return () => sub.remove();
  }, [isAuthenticated, lock]);
}
