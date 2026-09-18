// Warehouse Pro — Профиль: группы строк на ровных плоскостях, без объёма.
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Alert, ActivityIndicator, RefreshControl, Image, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/store/auth";
import { updateProfile, changePassword, getAgentDashboard, getMyShops, uploadFile } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useT, useLang, useLangStore } from "../../src/i18n";
import { useBrandingStore } from "../../src/store/branding";
import { SecureImage } from "../../src/components/SecureImage";
import { preparePhoto } from "../../src/lib/prepare-photo";
import { notify } from "../../src/store/toast";
import { MonthlyPlanCard } from "../../src/components/MonthlyPlanCard";
import { BiometricRow } from "../../src/components/BiometricRow";
import { Typography, Spacing, Radii, BOTTOM_TAB_HEIGHT, type ThemeColors } from "../../src/theme";
import { Badge, Button } from "../../src/components/ui";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

type IconName = keyof typeof Feather.glyphMap;

const roleMetaFor = (t: (ru: string, uz: string) => string): Record<string, { label: string; icon: IconName }> => ({
  agent: { label: t("Агент", "Agent"), icon: "truck" },
  supervisor: { label: t("Супервайзер", "Supervayzer"), icon: "eye" },
  ceo: { label: t("Руководитель", "Rahbar"), icon: "briefcase" },
  operator: { label: t("Оператор", "Operator"), icon: "headphones" },
  merchandiser: { label: t("Мерчандайзер", "Merchandayzer"), icon: "tag" },
  courier: { label: t("Курьер", "Kuryer"), icon: "truck" },
});

/*
  Что здесь поменялось и почему.

  Экран был набором неоморфных карточек с двойными тенями, крошечными
  заголовками «ОСНОВНОЕ» в 10 pt, полем email, которое нельзя редактировать,
  и коралловой кнопкой «Сохранить профиль» под формой, которую никто не
  заполняет, — читалось как чужой, дешёвый продукт. Теперь — как системные
  настройки: шапка с человеком, группы строк на белых плоскостях без теней,
  разделители, ряд 56 pt, действие открывается по нажатию на строку.
*/

/** Подпись группы: 12 pt, разрядка, вторичные чернила. */
function SectionLabel({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  return (
    <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: colors.text.secondary, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>
      {children}
    </Text>
  );
}

/** Белая плоскость группы: без тени и рамки, только форма. */
function Group({ children, colors, style }: { children: React.ReactNode; colors: ThemeColors; style?: object }) {
  return (
    <View style={[{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, overflow: "hidden", marginBottom: Spacing.xl }, style]}>
      {children}
    </View>
  );
}

function Line({ colors }: { colors: ThemeColors }) {
  return <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 64 }} />;
}

/** Ряд настроек: значок в лунке, заголовок, подпись/значение, справа шеврон или свой элемент. */
function Row({ icon, tone, title, subtitle, value, right, onPress, colors, danger }: {
  icon: IconName; tone?: string; title: string; subtitle?: string; value?: string; right?: React.ReactNode;
  onPress?: () => void; colors: ThemeColors; danger?: boolean;
}) {
  const ink = danger ? colors.status.danger : colors.text.primary;
  const iconTone = tone ?? (danger ? colors.status.danger : colors.text.secondary);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: Spacing.md, minHeight: 56, paddingHorizontal: Spacing.base, paddingVertical: 10, backgroundColor: pressed ? colors.bg.elevated : "transparent" })}
    >
      <View style={{ width: 36, height: 36, borderRadius: Radii.full, alignItems: "center", justifyContent: "center", backgroundColor: danger ? colors.status.dangerDim : colors.bg.elevated }}>
        <Feather name={icon} size={18} color={iconTone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: ink }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }} numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={colors.text.tertiary} /> : null)}
    </Pressable>
  );
}

/** Сегмент из двух-трёх значений: жёлоб, выбранное — белая плоскость. */
function Segment<T extends string>({ value, options, onChange, colors }: {
  value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 3 }}>
      {options.map(o => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="button" accessibilityState={{ selected: active }}
            style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radii.sm, backgroundColor: active ? colors.bg.card : "transparent" }}>
            <Text style={{ fontFamily: active ? Typography.fontSemibold : Typography.fontMedium, fontSize: Typography.size.sm, color: active ? colors.text.primary : colors.text.secondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const inputStyle = (colors: ThemeColors) => ({
  backgroundColor: colors.bg.input, borderRadius: Radii.md, paddingHorizontal: 14, minHeight: 46,
  fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary,
});

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);
  const { user, logout, updateUser } = useAuthStore();
  const colors = useThemeColors();
  const branding = useBrandingStore(s => s.branding);

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name ?? "");
  const [changingPwd, setChangingPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (user?.name) setNewName(user.name); }, [user?.name]);

  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const router = useRouter();
  const isAgent = user?.role === "agent";
  const isCourier = user?.role === "courier";
  // Норма месяца ставится полевым. У директора личного плана нет — карточка
  // «норма не назначена» была бы шумом.
  const isFieldRole = user?.role === "agent" || user?.role === "merchandiser";
  const roleMeta = roleMetaFor(t)[user?.role ?? ""] ?? { label: user?.role ?? "—", icon: "user" as IconName };

  const { refetch: refetchKpis } = useQuery({ queryKey: ["agentDashboard"], queryFn: getAgentDashboard, enabled: isAgent });
  const { refetch: refetchShops } = useQuery({ queryKey: ["shops"], queryFn: getMyShops, enabled: isAgent || isSupervisor });
  const onRefresh = async () => { setRefreshing(true); await Promise.all([refetchKpis(), refetchShops()]); setRefreshing(false); };

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => updateProfile(data),
    onSuccess: (_, v) => { updateUser({ name: v.name }); setEditingName(false); notify.success(t("Имя сохранено", "Ism saqlandi")); },
    onError: (e: Error) => notify.error(e.message),
  });

  // Снимок сначала уходит в S3: локальный путь file:///… в users показывался
  // только на этом телефоне и ломался у всех остальных, включая офис.
  const avatarMutation = useMutation({
    mutationFn: async (d: { uri: string }) => {
      const { dataUrl } = await preparePhoto(d.uri);
      const url = await uploadFile(dataUrl, "avatars");
      await updateProfile({ avatar: url });
      return url;
    },
    onSuccess: (url) => { updateUser({ avatar: url }); notify.success(t("Фото обновлено", "Rasm yangilandi")); },
    onError: (e: Error) => notify.error(e.message),
  });

  const handleAvatarPress = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert(t("Нужно разрешение", "Ruxsat kerak"), t("Доступ к галерее", "Galereyaga kirish")); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6,
    });
    const uri = result.assets?.[0]?.uri;
    if (!result.canceled && uri) avatarMutation.mutate({ uri });
  }, [avatarMutation, t]);

  const pwdMutation = useMutation({
    mutationFn: (d: { currentPassword: string; newPassword: string }) => changePassword(d),
    onSuccess: () => { setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setChangingPwd(false); notify.success(t("Пароль изменён", "Parol o'zgartirildi")); },
    onError: (e: Error) => notify.error(e.message),
  });

  const submitPassword = () => {
    if (!currentPwd || !newPwd) return notify.error(t("Заполните все поля", "Barcha maydonlarni to'ldiring"));
    if (newPwd !== confirmPwd) return notify.error(t("Пароли не совпадают", "Parollar mos emas"));
    if (newPwd.length < 8) return notify.error(t("Минимум 8 символов", "Kamida 8 ta belgi"));
    pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
  };

  const initials = (user?.name ?? "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.xl }}
        showsVerticalScrollIndicator={false}
        // Первое касание кнопки при открытой клавиатуре иначе только прячет
        // клавиатуру — человек жмёт «Сохранить» дважды и думает, что зависло.
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.primary} />}
      >
        {/* ── Человек ── */}
        <View style={{ alignItems: "center", paddingVertical: Spacing.lg, marginBottom: Spacing.md }}>
          <Pressable onPress={handleAvatarPress} accessibilityRole="button" accessibilityLabel={t("Сменить фото", "Rasmni almashtirish")} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 88, height: 88, borderRadius: 44, overflow: "hidden", backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={{ width: 88, height: 88 }} />
              ) : (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 30, color: colors.accent.primary }}>{initials}</Text>
              )}
              {avatarMutation.isPending && (
                <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.overlayDark }}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <View style={{ position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg.card, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg.primary }}>
              <Feather name="camera" size={14} color={colors.text.secondary} />
            </View>
          </Pressable>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: colors.text.primary, marginTop: Spacing.md }} numberOfLines={1}>{user?.name ?? "—"}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>{user?.email ?? ""}</Text>
          <Badge variant="info" icon={roleMeta.icon} style={{ marginTop: 10 }}>{roleMeta.label}</Badge>
        </View>

        {/* ── Норма месяца — то, ради чего полевой открывает вкладку ── */}
        {isFieldRole && (
          <View style={{ marginBottom: Spacing.xl }}>
            <MonthlyPlanCard />
          </View>
        )}

        {/* ── Деньги ── */}
        {(isAgent || isCourier) && (
          <>
            <SectionLabel colors={colors}>{t("Деньги", "Pul")}</SectionLabel>
            <Group colors={colors}>
              <Row icon="dollar-sign" tone={colors.accent.primary} title={t("Моя зарплата", "Mening oyligim")} subtitle={t("Начислено, выдано и подтверждение получения", "Hisoblangan, berilgan va olganini tasdiqlash")} onPress={() => router.push("/salary")} colors={colors} />
              {isAgent && (
                <>
                  <Line colors={colors} />
                  <Row icon="alert-circle" tone={colors.status.danger} title={t("Мои долги", "Mening qarzlarim")} subtitle={t("Кому идти собирать деньги", "Kimdan pul yig'ish kerak")} onPress={() => router.push("/debts")} colors={colors} />
                </>
              )}
            </Group>
          </>
        )}

        {/* ── Аккаунт ── */}
        <SectionLabel colors={colors}>{t("Аккаунт", "Hisob")}</SectionLabel>
        <Group colors={colors}>
          <Row icon="user" title={t("Имя", "Ism")} value={editingName ? undefined : user?.name ?? "—"} onPress={() => setEditingName(v => !v)} colors={colors}
            right={<Feather name={editingName ? "chevron-up" : "chevron-right"} size={18} color={colors.text.tertiary} />} />
          {editingName && (
            <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, gap: Spacing.sm }}>
              <TextInput value={newName} onChangeText={setNewName} placeholder={t("Как вас зовут", "Ismingiz")} placeholderTextColor={colors.text.tertiary} autoFocus style={inputStyle(colors)} />
              <Button variant="primary" size="md" fullWidth loading={updateMutation.isPending} disabled={!newName.trim() || newName.trim() === user?.name}
                onPress={() => updateMutation.mutate({ name: newName.trim() })}>{t("Сохранить", "Saqlash")}</Button>
            </View>
          )}
          <Line colors={colors} />
          <Row icon="mail" title="Email" value={user?.email ?? "—"} colors={colors} />
          <Line colors={colors} />
          <Row icon="key" title={t("Пароль", "Parol")} subtitle={changingPwd ? undefined : t("Сменить пароль входа", "Kirish parolini almashtirish")} onPress={() => setChangingPwd(v => !v)} colors={colors}
            right={<Feather name={changingPwd ? "chevron-up" : "chevron-right"} size={18} color={colors.text.tertiary} />} />
          {changingPwd && (
            <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, gap: Spacing.sm }}>
              <TextInput value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry placeholder={t("Текущий пароль", "Joriy parol")} placeholderTextColor={colors.text.tertiary} style={inputStyle(colors)} />
              <TextInput value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholder={t("Новый пароль (не короче 8)", "Yangi parol (kamida 8)")} placeholderTextColor={colors.text.tertiary} style={inputStyle(colors)} />
              <TextInput value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder={t("Повторите новый пароль", "Yangi parolni takrorlang")} placeholderTextColor={colors.text.tertiary} style={inputStyle(colors)} />
              <Button variant="primary" size="md" fullWidth loading={pwdMutation.isPending} disabled={!currentPwd || !newPwd} onPress={submitPassword}>{t("Изменить пароль", "Parolni o'zgartirish")}</Button>
            </View>
          )}
          <BiometricRow colors={colors} isDark={isDark} />
        </Group>

        {/* ── Оформление ── */}
        <SectionLabel colors={colors}>{t("Оформление", "Ko'rinish")}</SectionLabel>
        <Group colors={colors}>
          <Row icon={isDark ? "moon" : "sun"} title={t("Тема", "Mavzu")} colors={colors}
            right={<Segment value={isDark ? "dark" : "light"} colors={colors} onChange={(v) => { if ((v === "dark") !== isDark) toggleTheme(); }}
              options={[{ key: "light", label: t("Светлая", "Yorug'") }, { key: "dark", label: t("Тёмная", "Qorong'i") }]} />} />
          <Line colors={colors} />
          <Row icon="globe" title={t("Язык", "Til")} colors={colors}
            right={<Segment value={lang} colors={colors} onChange={(v) => { void setLang(v); }}
              // Каждый язык назван на самом себе: это и есть подпись переключателя.
              options={[{ key: "ru", label: "Русский" }, { key: "uz", label: "O'zbekcha" }]} />} />  // i18n-ignore
        </Group>

        {/* ── Выход ── */}
        <Group colors={colors}>
          <Row icon="log-out" danger title={t("Выйти из аккаунта", "Hisobdan chiqish")} colors={colors}
            onPress={() => Alert.alert(t("Выход", "Chiqish"), t("Вы уверены?", "Ishonchingiz komilmi?"), [{ text: t("Отмена", "Bekor"), style: "cancel" }, { text: t("Выйти", "Chiqish"), style: "destructive", onPress: logout }])} />
        </Group>

        {/* Знак и название организации: белая метка — сотрудник видит своё
            название, не имя поставщика; версия нужна поддержке. */}
        <View style={{ alignItems: "center", marginTop: Spacing.sm, gap: 8 }}>
          {branding.logoUrl ? (
            <View style={{ width: 44, height: 44, borderRadius: Radii.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <SecureImage uri={branding.logoUrl} style={{ width: 38, height: 38 }} resizeMode="contain" />
            </View>
          ) : null}
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>{branding.companyName} v{Constants.expoConfig?.version ?? "1.0.0"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
