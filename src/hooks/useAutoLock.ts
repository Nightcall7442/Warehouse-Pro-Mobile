import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuthStore } from "../store/auth";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useAutoLock() {
  const { isAuthenticated, logout } = useAuthStore();
  const backgroundedAt = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      // App going to background → record timestamp
      if (prev === "active" && nextState !== "active") {
        backgroundedAt.current = Date.now();
        return;
      }

      // App returning to foreground → check idle duration
      if (prev !== "active" && nextState === "active") {
        const elapsed = backgroundedAt.current
          ? Date.now() - backgroundedAt.current
          : 0;
        backgroundedAt.current = null;

        if (elapsed < IDLE_TIMEOUT_MS) return;

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = hasHardware
          ? await LocalAuthentication.isEnrolledAsync()
          : false;

        if (!isEnrolled) {
          // No biometrics available — skip lock
          return;
        }

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
