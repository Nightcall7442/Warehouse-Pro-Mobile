// Warehouse Pro — Login (matches web Login.tsx — gradient header + neo-card form)
import { useState, useEffect } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkShadowColor } from "../../src/theme";
import { Shadows } from "../../src/theme";
import { useBiometricAuth } from "../../src/hooks/useBiometricAuth";

// ── CardDots (matches web) ───────────────────────────────────────────────────
function CardDots() {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f06895" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f5a825" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2ec4b0" }} />
    </View>
  );
}

export default function LoginScreen() {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const { login, loginWithBiometric } = useAuthStore();
  const { capabilities, biometricEnabled, loginWithBiometric: biometricAuth } = useBiometricAuth();

  useEffect(() => {
    if (capabilities.hasHardware && capabilities.isEnrolled && biometricEnabled) {
      handleBiometricLogin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("Введите email и пароль"); return; }
    setError(""); setLoading(true);
    try { await login(email.trim().toLowerCase(), password); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message ?? err?.message ?? "Неверный email или пароль");
    } finally { setLoading(false); }
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true); setError("");
    try {
      const biometricOk = await biometricAuth();
      if (!biometricOk) { setError("Биометрия не удалась"); return; }
      const ok = await loginWithBiometric();
      if (!ok) setError("Сессия истекла");
    }
    catch { setError("Ошибка биометрии"); }
    finally { setBiometricLoading(false); }
  };

  const sc = isDark ? DarkShadowColor : Shadows.lg.shadowColor;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: Spacing.xl }} keyboardShouldPersistTaps="handled">

          {/* Gradient hero header (matches web mobile header) */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180 }}>
            <LinearGradient colors={isDark ? ["#1c1a17", "#221f1c"] : ["#5b6d8a", "#4a5c78"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
          </View>

          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: Spacing["2xl"], paddingTop: insets.top + 30, position: "relative", zIndex: 1 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Feather name="box" size={26} color="#fff" />
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: "#fff", letterSpacing: 0.5 }}>Warehouse Pro</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: "rgba(255,255,255,0.7)", marginTop: 4, letterSpacing: 0.5 }}>Агент · мобильное приложение</Text>
          </View>

          {/* Form card (matches web neo-card) */}
          <View style={{
            backgroundColor: colors.bg.card, borderRadius: Radii.xxl, borderWidth: 1,
            borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
            padding: Spacing.xl, paddingBottom: 36, position: "relative", zIndex: 1,
            shadowColor: sc, shadowOffset: Shadows.lg.shadowOffset, shadowOpacity: Shadows.lg.shadowOpacity, shadowRadius: Shadows.lg.shadowRadius, elevation: Shadows.lg.elevation,
          }}>
            {/* Top highlight (matches web neo-card::before) */}
            <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 28, right: 28, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)" }} />

            <CardDots />
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 28, color: colors.text.primary, letterSpacing: -0.5, marginBottom: 6 }}>Добро пожаловать</Text>
            <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary, marginBottom: Spacing.xl }}>Войдите, чтобы начать рабочий день</Text>

            {/* Error */}
            {error ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: Radii.md, backgroundColor: colors.status.dangerDim, marginBottom: Spacing.base, borderWidth: 1, borderColor: "rgba(232,80,80,0.3)" }}>
                <Feather name="alert-circle" size={16} color={colors.status.danger} />
                <Text style={{ flex: 1, color: colors.status.danger, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={{ marginBottom: Spacing.base }}>
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary, marginBottom: 8 }}>Email</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.input, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, shadowColor: sc, shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: -1 }}>
                <Feather name="mail" size={18} color={colors.text.muted} style={{ marginLeft: 14 }} />
                <TextInput style={{ flex: 1, padding: 14, fontSize: 15, fontFamily: Typography.fontBody, color: colors.text.primary }}
                  placeholder="you@company.com" placeholderTextColor={colors.text.muted}
                  value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!loading} />
              </View>
            </View>

            {/* Password */}
            <View style={{ marginBottom: Spacing.base }}>
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary, marginBottom: 8 }}>Пароль</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.input, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, shadowColor: sc, shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: -1 }}>
                <Feather name="lock" size={18} color={colors.text.muted} style={{ marginLeft: 14 }} />
                <TextInput style={{ flex: 1, padding: 14, paddingRight: 44, fontSize: 15, fontFamily: Typography.fontBody, color: colors.text.primary }}
                  placeholder="••••••••" placeholderTextColor={colors.text.muted}
                  value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="password" editable={!loading}
                  onSubmitEditing={handleLogin} />
                <TouchableOpacity style={{ position: "absolute", right: 12 }} onPress={() => setShowPassword(v => !v)} activeOpacity={0.7}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login button */}
            <TouchableOpacity onPress={handleLogin} disabled={loading}
              style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.lg, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: loading ? 0.6 : 1, shadowColor: colors.accent.primary, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="log-in" size={18} color="#fff" />}
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>Войти</Text>
            </TouchableOpacity>

            {/* Biometric */}
            {capabilities.hasHardware && capabilities.isEnrolled && biometricEnabled && (
              <TouchableOpacity onPress={handleBiometricLogin} disabled={biometricLoading} activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: Spacing.base, paddingVertical: Spacing.md, borderRadius: Radii.md, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, shadowColor: sc, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity, shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                  <Feather name={Platform.OS === "ios" ? "smartphone" : "key"} size={20} color={colors.accent.primary} />
                </View>
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary }}>
                  {biometricLoading ? "Проверка..." : Platform.OS === "ios" ? "Войти с Face ID" : "Войти с отпечатком"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Hint */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: Spacing.base, paddingHorizontal: 4 }}>
              <Feather name="info" size={13} color={colors.text.muted} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: Typography.size.xs, color: colors.text.muted, lineHeight: 18 }}>Используйте данные от веб-версии Warehouse Pro</Text>
            </View>
          </View>

          {/* Footer */}
          <Text style={{ textAlign: "center", fontSize: Typography.size.xs, color: colors.text.muted, marginTop: Spacing.xl, letterSpacing: 0.5, position: "relative", zIndex: 1 }}>© 2025 Warehouse Pro · v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
