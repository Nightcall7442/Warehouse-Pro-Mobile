// Warehouse Pro — экран входа, язык оформления v7
//
// ── Почему он переписан ──────────────────────────────────────────────────────
//
// Это единственный экран, до которого язык не дошёл вовсе. Цвета он из темы
// брал, а всё остальное делал по-своему: карточка отделялась от холста рамкой
// в один пиксель, скругления стояли числами, поля ввода были обведёнными
// коробками. В этом языке поверхность отделяется ОБЪЁМОМ — парой теней, — а
// поле ввода утоплено в холст жёлобом. Человек открывал приложение, видел одно
// оформление, входил и попадал в другое.
//
// Изменено только оформление. Ни одна кнопка, ни один обработчик, ни одна
// надпись и ни одно условие показа не тронуты.
import { useState, useEffect, useRef } from "react";
import { errorText } from "../../src/lib/error-text";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { TenantChoiceRequired, TotpCodeRequired } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Radii, Spacing, soft } from "../../src/theme";
import { useBrandingStore } from "../../src/store/branding";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../src/components/Animated";
import { SecureImage } from "../../src/components/SecureImage";
import { useBiometricAuth } from "../../src/hooks/useBiometricAuth";
import Constants from "expo-constants";
import { useT } from "../../src/i18n";

export default function LoginScreen() {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const branding = useBrandingStore(s => s.branding);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  /*
    Один адрес может быть заведён в нескольких организациях. Сервер в таком
    случае не выбирает за человека — данные в этих организациях разные — а
    отвечает 409 и называет их.

    Механизм был собран целиком и не подключён: api.ts бросает
    TenantChoiceRequired, store принимает tenantId, сервер его ждёт — а ловить
    ошибку было некому. Человек, заведённый в двух организациях, видел на
    экране текст отказа и войти с телефона НЕ МОГ ВООБЩЕ. В вебе выбор есть.
  */
  const [orgChoice, setOrgChoice] = useState<{ message: string; organizations: Array<{ tenantId: number; name: string }> } | null>(null);
  // Второй фактор: сервер попросил код — показываем поле и шлём тот же вход с кодом.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  const { login, loginWithBiometric } = useAuthStore();
  const { capabilities, biometricEnabled, loginWithBiometric: biometricAuth } = useBiometricAuth();

  /*
    Цвета экрана входа — из темы, а не свои.

    Шапка (heroBg) — плашка hero: бирюза знака в светлой теме, тёмная
    карточка в тёмной; надписи на ней — чернила hero. Кнопка «Войти» —
    главное действие (brand.cta), как «Новый заказ» на главной.
  */
  const C = {
    bg: colors.bg.primary,
    card: colors.bg.card,
    heroBg: [colors.hero.bg, colors.hero.bg] as const,
    accent: colors.brand.primary,
    accentLight: colors.brand.primaryLight,
    text: colors.text.primary,
    textSec: colors.text.secondary,
    textMuted: colors.text.tertiary,
    inputBg: colors.bg.input,
    danger: colors.status.danger,
    dangerBg: colors.status.dangerDim,
  };

  const handleLogin = async (tenantId?: number) => {
    if (!email.trim() || !password) { setError(t("Введите email и пароль", "Email va parolni kiriting")); return; }
    setError(""); setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password, tenantId, code.trim() || undefined);
    }
    catch (e: unknown) {
      // Не отказ, а вопрос: в какой из организаций входим.
      if (e instanceof TenantChoiceRequired) {
        setOrgChoice({ message: e.message, organizations: e.organizations });
        return;
      }
      if (e instanceof TotpCodeRequired) {
        setNeedCode(true);
        return;
      }
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
      if (!biometricOk) { setError(t("Биометрия не удалась", "Biometriya o'tmadi")); return; }
      const ok = await loginWithBiometric();
      if (!ok) setError(t("Сессия истекла", "Sessiya muddati tugadi"));
    }
    catch { setError(t("Ошибка биометрии", "Biometriya xatosi")); }
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
    const timer = setTimeout(() => { void handleBiometricLogin(); }, 0);
    return () => clearTimeout(timer);
  }, [capabilities.hasHardware, capabilities.isEnrolled, biometricEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Dark hero header (matching web left panel) ──────────────────── */}
          <LinearGradient colors={C.heroBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + Spacing.xxl, paddingBottom: Spacing["3xl"], paddingHorizontal: Spacing["2xl"] }}>
            {/* Световое пятно в углу шапки — чтобы плоскость не выглядела заливкой. */}
            <View style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, opacity: 0.05 }}>
              <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: Radii.full }} />
            </View>

            {/* Знак организации.

                До входа арендатор неизвестен — сервер не знает, чей это
                телефон, пока нет токена. Поэтому здесь показывается только то,
                что осталось на устройстве с прошлого входа; на новом телефоне
                (и после выхода, который бренд стирает) остаётся знак системы.

                Логотип лежит на светлой плашке: шапка тёмная в обеих темах, а
                логотип арендатора может быть тёмным — на тёмном он пропал бы. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.xxl }}>
              {branding.logoUrl ? (
                <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <SecureImage uri={branding.logoUrl} style={{ width: 34, height: 34 }} resizeMode="contain" />
                </View>
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="home" size={20} color={colors.hero.ink} />
                </View>
              )}
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.hero.ink, letterSpacing: -0.3 }}>{branding.companyName}</Text>
            </View>

            {/* Hero text */}
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 32, color: colors.hero.ink, lineHeight: 38, letterSpacing: -1 }}>
              {t("Управляйте\nбизнесом\nиз кармана", "Biznesni\ncho'ntakdan\nboshqaring")}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 14, color: colors.hero.inkSoft, marginTop: Spacing.lg, lineHeight: 22 }}>
              {t("Заказы, склад, агенты и аналитика — всё в одном приложении", "Buyurtmalar, ombor, agentlar va tahlil — hammasi bitta ilovada")}
            </Text>
          </LinearGradient>

          {/* ── Карточка входа ─────────────────────────────────────────────────
              Рамки нет: поверхность отделяется от холста парой теней — светлый
              блик сверху-слева, серая тень снизу-справа. Так устроены все
              карточки приложения (см. Card в components/ui). */}
          <View style={{ flex: 1, paddingHorizontal: Spacing.xl, marginTop: -Spacing.xl }}>
            <View style={{
              backgroundColor: C.card, borderRadius: Radii["2xl"],
              padding: Spacing["2xl"], paddingTop: Spacing.xxl,
              ...soft(isDark).raisedLg,
            }}>
              {/* Header */}
              <View style={{ marginBottom: Spacing.xxl }}>
                <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 26, color: C.text, letterSpacing: -0.6 }}>{t("Добро пожаловать", "Xush kelibsiz")}</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: C.textSec, marginTop: Spacing.xs + 2 }}>{t("Войдите, чтобы начать рабочий день", "Ish kunini boshlash uchun kiring")}</Text>
              </View>

              {/* Error.
                  Заливка вместо рамки: в этом языке цвет несёт смысл сам, а
                  обводка вокруг цветной плашки читается как вторая граница. */}
              {error ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm + 2, padding: Spacing.md, borderRadius: Radii.md, backgroundColor: C.dangerBg, marginBottom: Spacing.xl }}>
                  <Feather name="alert-circle" size={16} color={C.danger} />
                  <Text style={{ flex: 1, color: C.danger, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }}>{error}</Text>
                </View>
              ) : null}

              {/* Email.
                  Поле — вдавленный жёлоб, а не обведённая коробка: тот же
                  приём, что у поиска (SearchInput) и у сегмент-контрола. */}
              <View style={{ marginBottom: Spacing.lg + 2 }}>
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: Spacing.sm }}>Email</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: Radii.lg, ...soft(isDark).inset }}>
                  <Feather name="mail" size={16} color={C.textMuted} style={{ marginLeft: Spacing.base }} />
                  <TextInput
                    style={{ flex: 1, padding: Spacing.base, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: C.text }}
                    placeholder="you@company.com" placeholderTextColor={C.textMuted}
                    value={email} onChangeText={v => { setEmail(v); setOrgChoice(null); }} autoCapitalize="none"
                    keyboardType="email-address" autoComplete="email" editable={!loading}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={{ marginBottom: Spacing.lg + 2 }}>
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: Spacing.sm }}>{t("Пароль", "Parol")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: Radii.lg, ...soft(isDark).inset }}>
                  <Feather name="lock" size={16} color={C.textMuted} style={{ marginLeft: Spacing.base }} />
                  <TextInput
                    style={{ flex: 1, padding: Spacing.base, paddingRight: 44, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: C.text }}
                    placeholder="••••••••" placeholderTextColor={C.textMuted}
                    value={password} onChangeText={v => { setPassword(v); setOrgChoice(null); }} secureTextEntry={!showPassword}
                    autoComplete="password" editable={!loading} onSubmitEditing={() => handleLogin()}
                  />
                  <TouchableOpacity style={{ position: "absolute", right: Spacing.md }} onPress={() => setShowPassword(v => !v)} activeOpacity={0.7} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {needCode ? (
                <View style={{ marginBottom: Spacing.lg + 2 }}>
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: Spacing.sm }}>{t("Код из приложения", "Ilovadagi kod")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: Radii.lg, ...soft(isDark).inset }}>
                    <Feather name="shield" size={16} color={C.textMuted} style={{ marginLeft: Spacing.base }} />
                    <TextInput
                      testID="login-totp"
                      style={{ flex: 1, padding: Spacing.base, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: C.text }}
                      placeholder="123 456" placeholderTextColor={C.textMuted}
                      value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code"
                      autoFocus editable={!loading} onSubmitEditing={() => handleLogin()}
                    />
                  </View>
                </View>
              ) : null}

              {/* Выбор организации.
                  Строки приподняты на цвете холста, как второстепенные
                  действия рядом с коралловым главным: это не отказ, а вопрос,
                  и выглядеть тревожно он не должен. */}
              {orgChoice ? (
                <View style={{ marginBottom: Spacing.lg + 2, padding: Spacing.md, borderRadius: Radii.lg, backgroundColor: C.inputBg, ...soft(isDark).insetSm }}>
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text, marginBottom: Spacing.sm + 2 }}>
                    {orgChoice.message}
                  </Text>
                  {orgChoice.organizations.map(org => (
                    <PressableScale key={org.tenantId} onPress={() => handleLogin(org.tenantId)} disabled={loading} haptic="light">
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: Spacing.sm + 2,
                        paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
                        borderRadius: Radii.md, backgroundColor: C.card, marginTop: Spacing.sm,
                        ...soft(isDark).raisedSm,
                      }}>
                        <Feather name="briefcase" size={15} color={C.accent} />
                        <Text style={{ flex: 1, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text }}>
                          {org.name}
                        </Text>
                        <Feather name="chevron-right" size={15} color={C.textMuted} />
                      </View>
                    </PressableScale>
                  ))}
                </View>
              ) : null}

              {/* Главная кнопка — главное действие (brand.cta), как «Новый заказ». */}
              <PressableScale onPress={() => handleLogin()} disabled={loading} haptic="medium">
                <LinearGradient
                  colors={[colors.brand.cta, colors.brand.cta]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: Radii.lg, paddingVertical: Spacing.base,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm,
                    ...soft(isDark).raisedSm,
                    opacity: loading ? 0.7 : 1,
                  }}>
                  {/* Крутящийся кружок системы, а не значок «loader».
                      Значок неподвижен: во время входа он просто стоял на
                      кнопке, и это читалось как «зависло», а не «идёт». */}
                  {loading && <ActivityIndicator size="small" color={colors.brand.ctaInk} />}
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.brand.ctaInk }}>
                    {loading ? t("Вход...", "Kirilmoqda...") : t("Войти", "Kirish")}
                  </Text>
                </LinearGradient>
              </PressableScale>

              {/* Biometric.
                  Приподнятая поверхность цвета холста — второстепенное
                  действие рядом с коралловым главным. Лунка под значком
                  вдавлена, как у строк профиля. */}
              {capabilities.hasHardware && capabilities.isEnrolled && biometricEnabled && (
                <PressableScale onPress={handleBiometricLogin} disabled={biometricLoading} haptic="medium">
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm + 2, marginTop: Spacing.lg, paddingVertical: Spacing.base, borderRadius: Radii.lg, backgroundColor: C.card, ...soft(isDark).raisedSm }}>
                    <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", ...soft(isDark).insetSm }}>
                      <Feather name={Platform.OS === "ios" ? "smartphone" : "key"} size={16} color={C.accent} />
                    </View>
                    <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: C.text }}>
                      {biometricLoading ? t("Проверка...", "Tekshirilmoqda...") : Platform.OS === "ios" ? t("Войти с Face ID", "Face ID bilan kirish") : t("Войти с отпечатком", "Barmoq izi bilan kirish")}
                    </Text>
                  </View>
                </PressableScale>
              )}

              {/* Hint */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, marginTop: Spacing.xl, paddingHorizontal: Spacing.xs }}>
                <Feather name="info" size={13} color={C.textMuted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: Typography.size.xs + 1, fontFamily: Typography.fontRegular, color: C.textMuted, lineHeight: 18 }}>{t("Используйте данные от веб-версии", "Veb-versiyadagi login va parolni ishlating")} {branding.companyName}</Text>
              </View>
            </View>

            {/* Footer */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, marginTop: Spacing.xxl - 4, paddingBottom: insets.bottom + Spacing.xl }}>
              {/* Год берётся из часов, а не вписан: «© 2025» на экране входа
                  в 2026-м выглядит как брошенное приложение. */}
              <Text style={{ fontSize: Typography.size.xs + 1, fontFamily: Typography.fontRegular, color: C.textMuted }}>© {new Date().getFullYear()} {branding.companyName}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                {/* Зелёный берётся из темы: вписанный числом он не менялся бы
                    вместе с ней и в тёмной выглядел бы ядовитым. */}
                <View style={{ width: 6, height: 6, borderRadius: Radii.full, backgroundColor: colors.status.success }} />
                <Text style={{ fontSize: Typography.size.xs + 1, fontFamily: Typography.fontRegular, color: C.textMuted }}>v{Constants.expoConfig?.version ?? "?"}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
