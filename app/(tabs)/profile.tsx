// Warehouse Pro — Profile (matches web Settings.tsx exactly)
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator, RefreshControl, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/store/auth";
import { updateProfile, changePassword, getAgentDashboard, getMyShops } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import Constants from "expo-constants";

type IconName = keyof typeof Feather.glyphMap;

const ROLE_META: Record<string, { label: string; icon: IconName }> = {
  agent: { label: "Агент", icon: "truck" },
  supervisor: { label: "Супервайзер", icon: "eye" },
  ceo: { label: "Руководитель", icon: "briefcase" },
  operator: { label: "Оператор", icon: "headphones" },
  merchandiser: { label: "Мерчандайзер", icon: "tag" },
  courier: { label: "Курьер", icon: "truck" },
};

// ── Web-matching components ──────────────────────────────────────────────────
function NeoCard({ children, style, colors, isDark }: { children: React.ReactNode; style?: object; colors: ThemeColors; isDark: boolean }) {
  const sc = isDark ? DarkShadowColor : Shadows.lg.shadowColor;
  return (
    <View style={{
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xxl,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
      shadowColor: sc, shadowOffset: Shadows.lg.shadowOffset, shadowOpacity: Shadows.lg.shadowOpacity,
      shadowRadius: Shadows.lg.shadowRadius, elevation: Shadows.lg.elevation,
      overflow: "hidden",
      ...style,
    }}>
      {/* Top highlight line (matches web .neo-card::before) */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: Spacing.xl, right: Spacing.xl, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)" }} />
      {children}
    </View>
  );
}

function NeoInput({ value, onChangeText, placeholder, secureTextEntry, keyboardType, colors, isDark, style }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric"; colors: ThemeColors; isDark: boolean; style?: object;
}) {
  const sc = isDark ? DarkShadowColor : Shadows.xs.shadowColor;
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text.tertiary}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      style={[{
        backgroundColor: colors.bg.input,
        borderRadius: Radii.lg,
        borderWidth: 0,
        paddingHorizontal: 18,
        paddingVertical: 13,
        fontSize: Typography.size.base,
        fontFamily: Typography.fontRegular,
        color: colors.text.primary,
        // Inset shadow (matches web neo-input box-shadow: var(--shadow-pressed))
        shadowColor: sc,
        shadowOffset: { width: -3, height: -3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: -1,
      }, style]}
    />
  );
}

function Label({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  return (
    <Text style={{ fontSize: 10, fontFamily: Typography.fontMedium, color: colors.text.secondary, letterSpacing: 0.06, textTransform: "uppercase" as const, marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, logout, updateUser } = useAuthStore();
  const colors = useThemeColors();

  const [newName, setNewName] = useState(user?.name ?? "");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (user?.name) setNewName(user.name); }, [user?.name]);

  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isCourier = user?.role === "courier";
  const isAgent = user?.role === "agent";
  const roleMeta = ROLE_META[user?.role ?? ""] ?? { label: user?.role ?? "—", icon: "user" as IconName };

  const { data: kpis, refetch: refetchKpis } = useQuery({ queryKey: ["agentDashboard"], queryFn: getAgentDashboard, enabled: isAgent });
  const { refetch: refetchShops } = useQuery({ queryKey: ["shops"], queryFn: getMyShops, enabled: isAgent || isSupervisor });
  const onRefresh = async () => { setRefreshing(true); await Promise.all([refetchKpis(), refetchShops()]); setRefreshing(false); };

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => updateProfile(data),
    onSuccess: (_, v) => { updateUser({ name: v.name }); notify.success("Профиль обновлён"); },
    onError: (e: Error) => notify.error(e.message),
  });

  const avatarMutation = useMutation({
    mutationFn: (d: { avatar: string }) => updateProfile(d),
    onSuccess: (_, v) => { updateUser({ avatar: v.avatar }); notify.success("Аватар обновлён"); },
    onError: (e: Error) => notify.error(e.message),
  });

  const handleAvatarPress = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Нужно разрешение", "Доступ к галерее"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) avatarMutation.mutate({ avatar: result.assets[0].uri });
  }, [avatarMutation]);

  const pwdMutation = useMutation({
    mutationFn: (d: { currentPassword: string; newPassword: string }) => changePassword(d),
    onSuccess: () => { setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); notify.success("Пароль изменён"); },
    onError: (e: Error) => notify.error(e.message),
  });

  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.primary} />}
      >
        {/* Title */}
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 24, color: colors.text.primary, marginBottom: Spacing.xl }}>Настройки</Text>

        {/* ── Profile Card ── */}
        <NeoCard colors={colors} isDark={isDark}>
          {/* Avatar row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg, marginBottom: Spacing.xl }}>
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8}>
              <View style={{
                width: 64, height: 64, borderRadius: Radii.lg, overflow: "hidden",
                backgroundColor: colors.brand.primaryDim, borderWidth: 2, borderColor: colors.border.default,
                alignItems: "center", justifyContent: "center",
              }}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={{ width: 64, height: 64 }} />
                ) : (
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: colors.accent.primary }}>
                    {(user?.name ?? "?")[0]?.toUpperCase()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>{user?.name ?? "—"}</Text>
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>{user?.email ?? ""}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: colors.brand.primaryDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.full, alignSelf: "flex-start" }}>
                <Feather name={roleMeta.icon} size={11} color={colors.accent.primary} />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: colors.accent.primary }}>{roleMeta.label}</Text>
              </View>
            </View>
          </View>

          {/* ОСНОВНОЕ */}
          <Label colors={colors}>ОСНОВНОЕ</Label>
          <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
            <View>
              <Label colors={colors}>ИМЯ</Label>
              <NeoInput value={newName} onChangeText={setNewName} placeholder="Введите имя" colors={colors} isDark={isDark} />
            </View>
            <View>
              <Label colors={colors}>EMAIL</Label>
              <NeoInput value={user?.email ?? ""} onChangeText={() => {}} placeholder="email" keyboardType="email-address" colors={colors} isDark={isDark} style={{ opacity: 0.6 }} />
            </View>
          </View>
          {/* Save button (matches web neo-btn-primary) */}
          <TouchableOpacity
            onPress={() => updateMutation.mutate({ name: newName })}
            disabled={updateMutation.isPending || !newName.trim()}
            activeOpacity={0.85}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              backgroundColor: colors.accent.primary,
              borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 20,
              opacity: updateMutation.isPending || !newName.trim() ? 0.4 : 1,
              shadowColor: colors.accent.primary, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
            }}>
            {updateMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={14} color="#fff" />}
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: "#fff" }}>Сохранить профиль</Text>
          </TouchableOpacity>
        </NeoCard>

        {/* ── Password Card ── */}
        <NeoCard colors={colors} isDark={isDark} style={{ marginTop: Spacing.base }}>
          <Label colors={colors}>СМЕНА ПАРОЛЯ</Label>
          <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
            {[
              { label: "ТЕКУЩИЙ ПАРОЛЬ", value: currentPwd, setter: setCurrentPwd },
              { label: "НОВЫЙ ПАРОЛЬ", value: newPwd, setter: setNewPwd },
              { label: "ПОДТВЕРДИТЕ НОВЫЙ", value: confirmPwd, setter: setConfirmPwd },
            ].map((f, i) => (
              <View key={i}>
                <Label colors={colors}>{f.label}</Label>
                <NeoInput value={f.value} onChangeText={f.setter} secureTextEntry placeholder="••••••••" colors={colors} isDark={isDark} />
              </View>
            ))}
          </View>
          {/* Change password button (matches web neo-btn) */}
          <TouchableOpacity
            onPress={() => {
              if (!currentPwd || !newPwd) return notify.error("Заполните все поля");
              if (newPwd !== confirmPwd) return notify.error("Пароли не совпадают");
              if (newPwd.length < 8) return notify.error("Минимум 8 символов");
              pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
            }}
            disabled={pwdMutation.isPending || !currentPwd || !newPwd}
            activeOpacity={0.85}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              backgroundColor: colors.bg.elevated,
              borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 20,
              borderWidth: 1, borderColor: colors.border.default,
              opacity: pwdMutation.isPending || !currentPwd || !newPwd ? 0.4 : 1,
              shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
            }}>
            {pwdMutation.isPending ? <ActivityIndicator color={colors.text.primary} size="small" /> : <Feather name="lock" size={14} color={colors.text.secondary} />}
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>Изменить пароль</Text>
          </TouchableOpacity>
        </NeoCard>

        {/* ── Appearance Card ── */}
        <NeoCard colors={colors} isDark={isDark} style={{ marginTop: Spacing.base }}>
          <Label colors={colors}>ТЕМА</Label>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <TouchableOpacity onPress={() => { if (isDark) toggleTheme(); }} activeOpacity={0.85} style={{
              flex: 1, paddingVertical: 14, borderRadius: Radii.lg, alignItems: "center", gap: 6,
              backgroundColor: !isDark ? colors.accent.primary : colors.bg.elevated,
              borderWidth: 1.5, borderColor: !isDark ? colors.accent.primary : colors.border.default,
              shadowColor: !isDark ? colors.accent.primary : sc,
              shadowOffset: { width: 0, height: 2 }, shadowOpacity: !isDark ? 0.2 : 0.1, shadowRadius: 8, elevation: 2,
            }}>
              <Feather name="sun" size={18} color={!isDark ? "#fff" : colors.text.secondary} />
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: !isDark ? "#fff" : colors.text.secondary }}>Светлая</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (!isDark) toggleTheme(); }} activeOpacity={0.85} style={{
              flex: 1, paddingVertical: 14, borderRadius: Radii.lg, alignItems: "center", gap: 6,
              backgroundColor: isDark ? colors.accent.primary : colors.bg.elevated,
              borderWidth: 1.5, borderColor: isDark ? colors.accent.primary : colors.border.default,
              shadowColor: isDark ? colors.accent.primary : sc,
              shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.2 : 0.1, shadowRadius: 8, elevation: 2,
            }}>
              <Feather name="moon" size={18} color={isDark ? "#fff" : colors.text.secondary} />
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: isDark ? "#fff" : colors.text.secondary }}>Тёмная</Text>
            </TouchableOpacity>
          </View>
        </NeoCard>

        {/* ── Logout Card ── */}
        <TouchableOpacity
          onPress={() => Alert.alert("Выход", "Вы уверены?", [{ text: "Отмена", style: "cancel" }, { text: "Выйти", style: "destructive", onPress: logout }])}
          activeOpacity={0.85}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            backgroundColor: colors.bg.card, borderRadius: Radii.xxl,
            padding: Spacing.lg, marginTop: Spacing.base,
            borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
            shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity,
            shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
          }}>
          <Feather name="log-out" size={16} color={colors.status.danger} />
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.status.danger }}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        {/* Version */}
        <View style={{ alignItems: "center", marginTop: Spacing.xl }}>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>Warehouse Pro v{Constants.expoConfig?.version ?? "1.0.0"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
