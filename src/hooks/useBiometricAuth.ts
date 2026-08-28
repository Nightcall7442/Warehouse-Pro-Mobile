import { useState, useEffect, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { SecureStore } from "../storage";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

/**
 * Вход по отпечатку выключен.
 *
 * Заглушка по просьбе владельца: до сборки APK эта возможность не нужна.
 * Код не удалён — выключен одним значением, чтобы вернуть его было делом
 * одной строки, а не восстановления по истории.
 *
 * Что при этом меняется: с экрана входа пропадает кнопка «Войти с
 * отпечатком» (её условие включает biometricEnabled, app/(auth)/login.tsx),
 * и сам вход по биометрии не срабатывает.
 *
 * Чего НЕ меняется: экран автоблокировки (src/components/LockScreen.tsx)
 * работает по-прежнему. Он спрашивает отпечаток напрямую у системы и
 * допускает подмену кодом устройства (disableDeviceFallback: false), так что
 * запереть человека в приложении это выключение не может.
 */
const BIOMETRIC_LOGIN_ENABLED = false;

export interface BiometricCapabilities {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

export function useBiometricAuth() {
  const [capabilities, setCapabilities] = useState<BiometricCapabilities>({
    hasHardware: false,
    isEnrolled: false,
    supportedTypes: [],
  });
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkBiometricStatus() {
    setLoading(true);
    // Выключено — отвечаем «оборудования нет»: экран входа сам скроет кнопку,
    // и трогать его условие не приходится.
    if (!BIOMETRIC_LOGIN_ENABLED) {
      setCapabilities({ hasHardware: false, isEnrolled: false, supportedTypes: [] });
      setBiometricEnabled(false);
      setLoading(false);
      return;
    }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);

      setCapabilities({ hasHardware, isEnrolled, supportedTypes });
      setBiometricEnabled(enabled === "true");
    } catch {
      setCapabilities({ hasHardware: false, isEnrolled: false, supportedTypes: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkBiometricStatus();
  }, []);

  const enrollBiometric = useCallback(async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Подтвердите для включения биометрии",
      cancelLabel: "Отмена",
    });

    if (result.success) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
      setBiometricEnabled(true);
      return true;
    }
    return false;
  }, []);

  const loginWithBiometric = useCallback(async (): Promise<boolean> => {
    // Второй рубеж заглушки: кнопку с экрана уже убрали, но вызвать функцию
    // можно и из другого места — пусть она честно отвечает «не вышло», а не
    // поднимает системное окно отпечатка при выключенной возможности.
    if (!BIOMETRIC_LOGIN_ENABLED) return false;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Войти с Face ID",
      cancelLabel: "Отмена",
      disableDeviceFallback: false,
    });

    return result.success;
  }, []);

  const disableBiometric = useCallback(async () => {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    setBiometricEnabled(false);
  }, []);

  return {
    capabilities,
    biometricEnabled,
    loading,
    enrollBiometric,
    loginWithBiometric,
    disableBiometric,
  };
}
