// Warehouse Pro — Profile v2 (cold palette, Card component)
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Alert, ActivityIndicator, RefreshControl, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/store/auth";
import { updateProfile, changePassword, getAgentDashboard, getMyShops } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { Typography, Spacing, Radii } from "../../src/theme";
import { Card, Badge } from "../../src/components/ui";
import { PressableScale, FadeInItem } from "../../src/components/Animated";
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

function Label({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useThemeColors> }) {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (user?.name) setNewName(user.name); }, [user?.name]);

  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isAgent = user?.role === "agent";
  const roleMeta = ROLE_META[user?.role ?? ""] ?? { label: user?.role ?? "—", icon: "user" as IconName };

  const { refetch: refetchKpis } = useQuery({ queryKey: ["agentDashboard"], queryFn: getAgentDashboard, enabled: isAgent });
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
        <FadeInItem delay={0}>
          <Card style={{ padding: Spacing.xl }}>
            {/* Avatar row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg, marginBottom: Spacing.xl }}>
              <PressableScale onPress={handleAvatarPress} haptic="light">
                <View style={{ width: 64, height: 64, borderRadius: Radii.lg, overflow: "hidden", backgroundColor: colors.brand.primaryDim, borderWidth: 2, borderColor: colors.border.default, alignItems: "center", justifyContent: "center" }}>
                  {user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 64, height: 64 }} />
                  ) : (
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: colors.accent.primary }}>{(user?.name ?? "?")[0]?.toUpperCase()}</Text>
                  )}
                </View>
              </PressableScale>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>{user?.name ?? "—"}</Text>
                <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>{user?.email ?? ""}</Text>
                <Badge variant="info" icon={roleMeta.icon} style={{ marginTop: 6 }}>{roleMeta.label}</Badge>
              </View>
            </View>

            {/* ОСНОВНОЕ */}
            <Label colors={colors}>ОСНОВНОЕ</Label>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              <View>
                <Label colors={colors}>ИМЯ</Label>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Введите имя" placeholderTextColor={colors.text.tertiary}
                  style={{ backgroundColor: colors.bg.input, borderRadius: Radii.lg, borderWidth: 0, paddingHorizontal: 18, paddingVertical: 13, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary }} />
              </View>
              <View>
                <Label colors={colors}>EMAIL</Label>
                <TextInput value={user?.email ?? ""} onChangeText={() => {}} placeholder="email" keyboardType="email-address" placeholderTextColor={colors.text.tertiary}
                  style={{ backgroundColor: colors.bg.input, borderRadius: Radii.lg, borderWidth: 0, paddingHorizontal: 18, paddingVertical: 13, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary, opacity: 0.6 }} />
              </View>
            </View>
            {/* Save button */}
            <PressableScale onPress={() => updateMutation.mutate({ name: newName })} disabled={updateMutation.isPending || !newName.trim()} haptic="medium">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 20, opacity: updateMutation.isPending || !newName.trim() ? 0.4 : 1 }}>
                {updateMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={14} color="#fff" />}
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: "#fff" }}>Сохранить профиль</Text>
              </View>
            </PressableScale>
          </Card>
        </FadeInItem>

        {/* ── Password Card ── */}
        <FadeInItem delay={40}>
          <Card style={{ padding: Spacing.xl, marginTop: Spacing.base }}>
            <Label colors={colors}>СМЕНА ПАРОЛЯ</Label>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              {[
                { label: "ТЕКУЩИЙ ПАРОЛЬ", value: currentPwd, setter: setCurrentPwd },
                { label: "НОВЫЙ ПАРОЛЬ", value: newPwd, setter: setNewPwd },
                { label: "ПОДТВЕРДИТЕ НОВЫЙ", value: confirmPwd, setter: setConfirmPwd },
              ].map((f, i) => (
                <View key={i}>
                  <Label colors={colors}>{f.label}</Label>
                  <TextInput value={f.value} onChangeText={f.setter} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.text.tertiary}
                    style={{ backgroundColor: colors.bg.input, borderRadius: Radii.lg, borderWidth: 0, paddingHorizontal: 18, paddingVertical: 13, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary }} />
                </View>
              ))}
            </View>
            {/* Change password button */}
            <PressableScale
              onPress={() => {
                if (!currentPwd || !newPwd) return notify.error("Заполните все поля");
                if (newPwd !== confirmPwd) return notify.error("Пароли не совпадают");
                if (newPwd.length < 8) return notify.error("Минимум 8 символов");
                pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
              }}
              disabled={pwdMutation.isPending || !currentPwd || !newPwd}
              haptic="medium"
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border.default, opacity: pwdMutation.isPending || !currentPwd || !newPwd ? 0.4 : 1 }}>
                {pwdMutation.isPending ? <ActivityIndicator color={colors.text.primary} size="small" /> : <Feather name="lock" size={14} color={colors.text.secondary} />}
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>Изменить пароль</Text>
              </View>
            </PressableScale>
          </Card>
        </FadeInItem>

        {/* ── Appearance Card ── */}
        <FadeInItem delay={80}>
          <Card style={{ padding: Spacing.xl, marginTop: Spacing.base }}>
            <Label colors={colors}>ТЕМА</Label>
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <PressableScale onPress={() => { if (isDark) toggleTheme(); }} haptic="light" style={{ flex: 1 }}>
                <View style={{
                  paddingVertical: 14, borderRadius: Radii.lg, alignItems: "center", gap: 6,
                  backgroundColor: !isDark ? colors.accent.primary : colors.bg.elevated,
                  borderWidth: 1.5, borderColor: !isDark ? colors.accent.primary : colors.border.default,
                }}>
                  <Feather name="sun" size={18} color={!isDark ? "#fff" : colors.text.secondary} />
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: !isDark ? "#fff" : colors.text.secondary }}>Светлая</Text>
                </View>
              </PressableScale>
              <PressableScale onPress={() => { if (!isDark) toggleTheme(); }} haptic="light" style={{ flex: 1 }}>
                <View style={{
                  paddingVertical: 14, borderRadius: Radii.lg, alignItems: "center", gap: 6,
                  backgroundColor: isDark ? colors.accent.primary : colors.bg.elevated,
                  borderWidth: 1.5, borderColor: isDark ? colors.accent.primary : colors.border.default,
                }}>
                  <Feather name="moon" size={18} color={isDark ? "#fff" : colors.text.secondary} />
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: isDark ? "#fff" : colors.text.secondary }}>Тёмная</Text>
                </View>
              </PressableScale>
            </View>
          </Card>
        </FadeInItem>

        {/* ── Logout Card ── */}
        <FadeInItem delay={120}>
          <PressableScale
            onPress={() => Alert.alert("Выход", "Вы уверены?", [{ text: "Отмена", style: "cancel" }, { text: "Выйти", style: "destructive", onPress: logout }])}
            haptic="medium"
          >
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: Spacing.lg, marginTop: Spacing.base, borderColor: colors.status.danger + "30", borderWidth: 1 }}>
              <Feather name="log-out" size={16} color={colors.status.danger} />
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.status.danger }}>Выйти из аккаунта</Text>
            </Card>
          </PressableScale>
        </FadeInItem>

        {/* Version */}
        <View style={{ alignItems: "center", marginTop: Spacing.xl }}>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>Warehouse Pro v{Constants.expoConfig?.version ?? "1.0.0"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
