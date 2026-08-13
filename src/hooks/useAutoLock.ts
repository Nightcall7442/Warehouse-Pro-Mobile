import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuthStore } from "../store/auth";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Persisted, not just an in-memory ref — a ref resets to null whenever the OS
 * kills the app in the background (routine on Android, and expected on a
 * phone shared across shifts). Without persistence, reopening a killed app
 * always measured elapsed-time-in-background as 0 and skipped the lock
 * entirely, no matter how many hours had actually passed.
 */
const BACKGROUNDED_AT_KEY = "auto_lock_backgrounded_at";

export function useAutoLock() {
  const { isAuthenticated, logout } = useAuthStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      // App going to background → record timestamp
      if (prev === "active" && nextState !== "active") {
        await AsyncStorage.setItem(BACKGROUNDED_AT_KEY, String(Date.now()));
        return;
      }

      // App returning to foreground → check idle duration
      if (prev !== "active" && nextState === "active") {
        const stored = await AsyncStorage.getItem(BACKGROUNDED_AT_KEY);
        const elapsed = stored ? Date.now() - Number(stored) : 0;
        await AsyncStorage.removeItem(BACKGROUNDED_AT_KEY);

        if (elapsed < IDLE_TIMEOUT_MS) return;

        // Gate on hardware, not enrollment: authenticateAsync falls back to
        // the device PIN/pattern on its own when no biometric is enrolled.
        // Gating on isEnrolled skipped the lock entirely on any phone with a
        // sensor the agent never registered a fingerprint on, PIN or not.
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) return;

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Подтвердите вход",
          cancelLabel: "Выйти",
          disableDeviceFallback: false,
        });

        if (!result.success) {
          await logout();
        }
      }
    });

    return () => sub.remove();
  }, [isAuthenticated, logout]);
}
