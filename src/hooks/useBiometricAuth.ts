import { useState, useEffect, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { SecureStore } from "../storage";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";

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
