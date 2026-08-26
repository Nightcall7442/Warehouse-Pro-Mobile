// Warehouse Pro — Login v3 (premium design matching web Login.tsx)
import { useState, useEffect } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../src/components/Animated";
import { useBiometricAuth } from "../../src/hooks/useBiometricAuth";
import { TenantChoiceRequired } from "../../src/api";

export default function LoginScreen() {
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  // Адрес заведён в нескольких организациях и пароль подошёл к нескольким —
  // сервер называет их, выбирает человек.
  const [orgChoice, setOrgChoice] = useState<{ message: string; organizations: Array<{ tenantId: number; name: string }> } | null>(null);
  const { login, loginWithBiometric } = useAuthStore();
  const { capabilities, biometricEnabled, loginWithBiometric: biometricAuth } = useBiometricAuth();

  // Web-matching colors
  const C = {
    bg: isDark ? "#1c1a17" : "#faf9f7",
    card: isDark ? "#221f1c" : "#ffffff",
    cardBorder: isDark ? "rgba(255,255,255,0.06)" : "#f0eeeb",
    heroBg: isDark ? (["#1c1a17", "#221f1c"] as const) : (["#111827", "#1f2937"] as const),
    accent: "#4f46e5", // Web purple
    accentLight: "#6366f1",
    text: isDark ? "#ede9e3" : "#111827",
    textSec: isDark ? "#a39d92" : "#6b7280",
    textMuted: isDark ? "#8a8478" : "#9ca3af",
    inputBg: isDark ? "#262320" : "#ffffff",
    inputBorder: isDark ? "#322e28" : "#e5e7eb",
    danger: "#dc2626",
    dangerBg: isDark ? "rgba(220,38,38,0.12)" : "#fef2f2",
    dangerBorder: isDark ? "rgba(220,38,38,0.3)" : "#fecaca",
  };

  const handleLogin = async (tenantId?: number) => {
    if (!email.trim() || !password) { setError("Введите email и пароль"); return; }
    setError(""); setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password, tenantId);
      setOrgChoice(null);
    }
    catch (e: unknown) {
      if (e instanceof TenantChoiceRequired) {
        setOrgChoice({ message: e.message, organizations: e.organizations });
        return;
      }
      // Сервер отдаёт текст в поле error, а не message: раньше читалось только
      // message, поэтому любой понятный отказ показывался как «Неверный email
      // или пароль».
      const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setError(err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? "Неверный email или пароль");
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

  useEffect(() => {
    if (!(capabilities.hasHardware && capabilities.isEnrolled && biometricEnabled)) return;
    // Отложено на такт: вызов прямо в теле эффекта ставит state внутри
    // отрисовки. Заодно экран успевает нарисоваться до системного запроса
    // отпечатка — иначе он всплывает поверх пустоты.
    const id = setTimeout(() => { void handleBiometricLogin(); }, 0);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Dark hero header (matching web left panel) ──────────────────── */}
          <LinearGradient colors={C.heroBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 32, paddingBottom: 40, paddingHorizontal: 24 }}>
            {/* Subtle grid pattern effect */}
            <View style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, opacity: 0.05 }}>
              <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 100 }} />
            </View>

            {/* Logo */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 32 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
                <Feather name="home" size={20} color="#fff" />
              </View>
              <Text style={{ fontFamily: "DM Sans", fontSize: 18, fontWeight: "700", color: "#fff", letterSpacing: -0.3 }}>Warehouse Pro</Text>
            </View>

            {/* Hero text */}
            <Text style={{ fontFamily: "DM Sans", fontSize: 32, fontWeight: "800", color: "#fff", lineHeight: 38, letterSpacing: -1 }}>
              Управляйте{"\n"}бизнесом{"\n"}из кармана
            </Text>
            <Text style={{ fontFamily: "DM Sans", fontSize: 14, color: "#9ca3af", marginTop: 16, lineHeight: 22 }}>
              Заказы, склад, агенты и аналитика — всё в одном приложении
            </Text>
          </LinearGradient>

          {/* ── Form card (matching web right panel) ────────────────────────── */}
          <View style={{ flex: 1, paddingHorizontal: 20, marginTop: -20 }}>
            <View style={{
              backgroundColor: C.card, borderRadius: 20, padding: 28, paddingTop: 32,
              borderWidth: 1, borderColor: C.cardBorder,
              shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.06, shadowRadius: 16, elevation: 8,
            }}>
              {/* Header */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontFamily: "DM Sans", fontSize: 26, fontWeight: "700", color: C.text, letterSpacing: -0.5 }}>Добро пожаловать</Text>
                <Text style={{ fontFamily: "DM Sans", fontSize: 14, color: C.textSec, marginTop: 6 }}>Войдите, чтобы начать рабочий день</Text>
              </View>

              {/* Выбор организации */}
              {orgChoice ? (
                <View style={{ padding: 12, borderRadius: 10, backgroundColor: C.inputBg, marginBottom: 20, borderWidth: 1, borderColor: C.inputBorder, gap: 8 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontFamily: "DM Sans", fontWeight: "500" }}>{orgChoice.message}</Text>
                  {orgChoice.organizations.map(org => (
                    <TouchableOpacity
                      key={org.tenantId}
                      disabled={loading}
                      onPress={() => handleLogin(org.tenantId)}
                      style={{ padding: 12, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder }}
                    >
                      <Text style={{ color: C.text, fontSize: 14, fontFamily: "DM Sans", fontWeight: "600" }}>{org.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Error */}
              {error ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, backgroundColor: C.dangerBg, marginBottom: 20, borderWidth: 1, borderColor: C.dangerBorder }}>
                  <Feather name="alert-circle" size={16} color={C.danger} />
                  <Text style={{ flex: 1, color: C.danger, fontSize: 13, fontFamily: "DM Sans", fontWeight: "500" }}>{error}</Text>
                </View>
              ) : null}

              {/* Email */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 13, fontFamily: "DM Sans", fontWeight: "600", color: C.text, marginBottom: 8 }}>Email</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.inputBorder }}>
                  <Feather name="mail" size={16} color={C.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={{ flex: 1, padding: 14, fontSize: 14, fontFamily: "DM Sans", color: C.text }}
                    placeholder="you@company.com" placeholderTextColor={C.textMuted}
                    value={email} onChangeText={t => { setEmail(t); setOrgChoice(null); }} autoCapitalize="none"
                    keyboardType="email-address" autoComplete="email" editable={!loading}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 13, fontFamily: "DM Sans", fontWeight: "600", color: C.text, marginBottom: 8 }}>Пароль</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.inputBorder }}>
                  <Feather name="lock" size={16} color={C.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={{ flex: 1, padding: 14, paddingRight: 44, fontSize: 14, fontFamily: "DM Sans", color: C.text }}
                    placeholder="••••••••" placeholderTextColor={C.textMuted}
                    value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
                    autoComplete="password" editable={!loading} onSubmitEditing={() => handleLogin()}
                  />
                  <TouchableOpacity style={{ position: "absolute", right: 12 }} onPress={() => setShowPassword(v => !v)} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login button (matching web #4f46e5) */}
              <PressableScale onPress={() => handleLogin()} disabled={loading} haptic="medium">
                <View style={{
                  backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
                  opacity: loading ? 0.7 : 1,
                }}>
                  {loading && <Feather name="loader" size={16} color="#fff" />}
                  <Text style={{ fontFamily: "DM Sans", fontSize: 14, fontWeight: "600", color: "#fff" }}>
                    {loading ? "Вход..." : "Войти"}
                  </Text>
                </View>
              </PressableScale>

              {/* Biometric */}
              {capabilities.hasHardware && capabilities.isEnrolled && biometricEnabled && (
                <PressableScale onPress={handleBiometricLogin} disabled={biometricLoading} haptic="medium">
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16, paddingVertical: 14, borderRadius: 10, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f9fafb", borderWidth: 1, borderColor: C.cardBorder }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? "rgba(79,70,229,0.12)" : "rgba(79,70,229,0.08)", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={Platform.OS === "ios" ? "smartphone" : "key"} size={16} color={C.accent} />
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: "DM Sans", fontWeight: "500", color: C.text }}>
                      {biometricLoading ? "Проверка..." : Platform.OS === "ios" ? "Войти с Face ID" : "Войти с отпечатком"}
                    </Text>
                  </View>
                </PressableScale>
              )}

              {/* Hint */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 20, paddingHorizontal: 4 }}>
                <Feather name="info" size={13} color={C.textMuted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 18 }}>Используйте данные от веб-версии Warehouse Pro</Text>
              </View>
            </View>

            {/* Footer (matching web) */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, paddingBottom: insets.bottom + 20 }}>
              <Text style={{ fontSize: 12, color: C.textMuted }}>© 2025 Warehouse Pro</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
                <Text style={{ fontSize: 12, color: C.textMuted }}>v2.5.0</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
