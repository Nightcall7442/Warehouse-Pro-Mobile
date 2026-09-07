// Warehouse Pro — Login v3 (premium design matching web Login.tsx)
import { useState, useEffect, useRef } from "react";
import { errorText } from "../../src/lib/error-text";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Gradients } from "../../src/theme";
import { useBrandingStore } from "../../src/store/branding";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../src/components/Animated";
import { SecureImage } from "../../src/components/SecureImage";
import { useBiometricAuth } from "../../src/hooks/useBiometricAuth";

export default function LoginScreen() {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const branding = useBrandingStore(s => s.branding);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const { login, loginWithBiometric } = useAuthStore();
  const { capabilities, biometricEnabled, loginWithBiometric: biometricAuth } = useBiometricAuth();

  /*
    Цвета экрана входа — из темы, а не свои.

    Шапка (heroBg) остаётся тёмной и в светлой теме: это единственное место,
    где фирменный цвет показан во всю ширину, и белая надпись на нём читается.
    Берётся коралловый градиент марки вместо прежнего сине-серого.
  */
  const C = {
    bg: colors.bg.primary,
    card: colors.bg.card,
    cardBorder: colors.border.subtle,
    heroBg: Gradients.primary,
    accent: colors.brand.primary,
    accentLight: colors.brand.primaryLight,
    text: colors.text.primary,
    textSec: colors.text.secondary,
    textMuted: colors.text.tertiary,
    inputBg: colors.bg.input,
    inputBorder: colors.border.default,
    danger: colors.status.danger,
    dangerBg: colors.status.dangerDim,
    dangerBorder: colors.status.dangerDim,
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("Введите email и пароль"); return; }
    setError(""); setLoading(true);
    try { await login(email.trim().toLowerCase(), password); }
    catch (e: unknown) {
      // Здесь наружу выходил текст axios: «Network Error», «timeout of
      // 15000ms exceeded». Агент, у которого пропала связь, читал об этом
      // по-английски на экране входа. Разбор отказа — в lib/error-text.
      setError(errorText(e));
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

  // Предложить вход по биометрии при открытии экрана. Эффект здесь нужен
  // по-настоящему: он поднимает системное окно Face ID, а не считает значение
  // для отрисовки.
  //
  // Что было не так. Список зависимостей был пуст, а правило подавлено.
  // useBiometricAuth читает hasHardware/isEnrolled асинхронно, поэтому на
  // монтировании в условие приходили нули — и окно не появлялось никогда.
  // Теперь эффект ждёт, пока возможности устройства прочитаны, а ref не даёт
  // спросить дважды.
  //
  // Запуск отложен на следующий тик, и вот зачем: системное окно нельзя
  // поднимать в том же кадре, в котором экран только монтируется, а снятие
  // таймера в уборке гасит запрос, если экран успел закрыться раньше — иначе
  // Face ID всплывал уже поверх следующего экрана.
  const biometricOffered = useRef(false);
  useEffect(() => {
    if (biometricOffered.current) return;
    if (!capabilities.hasHardware || !capabilities.isEnrolled || !biometricEnabled) return;
    biometricOffered.current = true;
    const t = setTimeout(() => { void handleBiometricLogin(); }, 0);
    return () => clearTimeout(t);
  }, [capabilities.hasHardware, capabilities.isEnrolled, biometricEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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

            {/* Знак организации.

                До входа арендатор неизвестен — сервер не знает, чей это
                телефон, пока нет токена. Поэтому здесь показывается только то,
                что осталось на устройстве с прошлого входа; на новом телефоне
                (и после выхода, который бренд стирает) остаётся знак системы.

                Логотип лежит на светлой плашке: шапка тёмная в обеих темах, а
                логотип арендатора может быть тёмным — на тёмном он пропал бы. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 32 }}>
              {branding.logoUrl ? (
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <SecureImage uri={branding.logoUrl} style={{ width: 34, height: 34 }} resizeMode="contain" />
                </View>
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="home" size={20} color="#fff" />
                </View>
              )}
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: "#fff", letterSpacing: -0.3 }}>{branding.companyName}</Text>
            </View>

            {/* Hero text */}
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 32, color: "#fff", lineHeight: 38, letterSpacing: -1 }}>
              Управляйте{"\n"}бизнесом{"\n"}из кармана
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 14, color: "rgba(255,255,255,0.88)", marginTop: 16, lineHeight: 22 }}>
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
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 26, color: C.text, letterSpacing: -0.5 }}>Добро пожаловать</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 14, color: C.textSec, marginTop: 6 }}>Войдите, чтобы начать рабочий день</Text>
              </View>

              {/* Error */}
              {error ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, backgroundColor: C.dangerBg, marginBottom: 20, borderWidth: 1, borderColor: C.dangerBorder }}>
                  <Feather name="alert-circle" size={16} color={C.danger} />
                  <Text style={{ flex: 1, color: C.danger, fontSize: 13, fontFamily: Typography.fontMedium }}>{error}</Text>
                </View>
              ) : null}

              {/* Email */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 13, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: 8 }}>Email</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.inputBorder }}>
                  <Feather name="mail" size={16} color={C.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={{ flex: 1, padding: 14, fontSize: 14, fontFamily: Typography.fontRegular, color: C.text }}
                    placeholder="you@company.com" placeholderTextColor={C.textMuted}
                    value={email} onChangeText={setEmail} autoCapitalize="none"
                    keyboardType="email-address" autoComplete="email" editable={!loading}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 13, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: 8 }}>Пароль</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.inputBorder }}>
                  <Feather name="lock" size={16} color={C.textMuted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={{ flex: 1, padding: 14, paddingRight: 44, fontSize: 14, fontFamily: Typography.fontRegular, color: C.text }}
                    placeholder="••••••••" placeholderTextColor={C.textMuted}
                    value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
                    autoComplete="password" editable={!loading} onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity style={{ position: "absolute", right: 12 }} onPress={() => setShowPassword(v => !v)} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login button (matching web #4f46e5) */}
              <PressableScale onPress={handleLogin} disabled={loading} haptic="medium">
                <View style={{
                  backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
                  opacity: loading ? 0.7 : 1,
                }}>
                  {loading && <Feather name="loader" size={16} color="#fff" />}
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: "#fff" }}>
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
                    <Text style={{ fontSize: 13, fontFamily: Typography.fontMedium, color: C.text }}>
                      {biometricLoading ? "Проверка..." : Platform.OS === "ios" ? "Войти с Face ID" : "Войти с отпечатком"}
                    </Text>
                  </View>
                </PressableScale>
              )}

              {/* Hint */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 20, paddingHorizontal: 4 }}>
                <Feather name="info" size={13} color={C.textMuted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 18 }}>Используйте данные от веб-версии {branding.companyName}</Text>
              </View>
            </View>

            {/* Footer (matching web) */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, paddingBottom: insets.bottom + 20 }}>
              {/* Год берётся из часов, а не вписан: «© 2025» на экране входа
                  в 2026-м выглядит как брошенное приложение. */}
              <Text style={{ fontSize: 12, color: C.textMuted }}>© {new Date().getFullYear()} {branding.companyName}</Text>
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
