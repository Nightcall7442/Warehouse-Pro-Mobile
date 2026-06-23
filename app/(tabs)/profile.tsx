import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/store/auth";
import { updateProfile, changePassword, getAgentDashboard, getMyShops } from "../../src/api";
import { useThemeStore, useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, Shadows, Gradients } from "../../src/theme";
import { notify } from "../../src/store/toast";

type IconName = keyof typeof Feather.glyphMap;

const ROLE_META: Record<string, { label: string; icon: IconName; color: string }> = {
  agent:        { label: "Агент",          icon: "truck",       color: "#6366F1" },
  supervisor:   { label: "Супервайзер",    icon: "eye",         color: "#8B5CF6" },
  ceo:          { label: "Руководитель",   icon: "briefcase",   color: "#F59E0B" },
  operator:     { label: "Оператор",       icon: "headphones",  color: "#10B981" },
  merchandiser: { label: "Мерчандайзер",   icon: "tag",         color: "#EC4899" },
};

// ── Stat card for role-specific KPIs ─────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: IconName; color: string }) {
  const colors = useThemeColors();
  return (
    <View style={{
      flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.lg,
      borderWidth: 1, borderColor: colors.border.default, padding: 14,
    }}>
      <View style={{
        width: 32, height: 32, borderRadius: Radii.md,
        backgroundColor: color + "18", alignItems: "center", justifyContent: "center",
        marginBottom: 10,
      }}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={{ fontFamily: Typography.fontBold, fontSize: 20, color: colors.text.primary }}>
        {value}
      </Text>
      <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.muted, marginTop: 2, letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text style={{
      fontFamily: Typography.fontBold, fontSize: 11, color: colors.text.muted,
      letterSpacing: 1.5, marginTop: 24, marginBottom: 8, marginLeft: 4,
    }}>
      {title}
    </Text>
  );
}

// ── Setting row ──────────────────────────────────────────────────────────────
function SettingRow({
  icon, label, sublabel, right, onPress, danger, colors,
}: {
  icon: IconName; label: string; sublabel?: string; right?: React.ReactNode;
  onPress?: () => void; danger?: boolean; colors: any;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 12,
      }}>
      <View style={{
        width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center",
        backgroundColor: danger ? colors.status.dangerDim : colors.brand.primaryDim,
      }}>
        <Feather name={icon} size={17} color={danger ? colors.status.danger : colors.brand.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontFamily: Typography.fontMedium, fontSize: 14,
          color: danger ? colors.status.danger : colors.text.primary,
        }}>
          {label}
        </Text>
        {sublabel && (
          <Text style={{
            fontFamily: Typography.fontRegular, fontSize: 12,
            color: colors.text.muted, marginTop: 2,
          }}>
            {sublabel}
          </Text>
        )}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={16} color={colors.text.muted} /> : null)}
    </Wrapper>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────
function Divider({ colors }: { colors: any }) {
  return <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 64 }} />;
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, colors, style }: { children: React.ReactNode; colors: any; style?: any }) {
  return (
    <View style={[{
      backgroundColor: colors.bg.card, borderRadius: Radii.xl,
      borderWidth: 1, borderColor: colors.border.default,
      marginBottom: 12, overflow: "hidden", ...Shadows.sm,
    }, style]}>
      {children}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { user, logout, updateUser } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();

  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(user?.name ?? "");
  const [editPwd, setEditPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const isSupervisor = user?.role === "supervisor";
  const roleMeta = ROLE_META[user?.role ?? ""] ?? { label: user?.role ?? "—", icon: "user", color: "#6366F1" };

  // Role-specific KPIs
  const { data: kpis } = useQuery({
    queryKey: ["agentDashboard"],
    queryFn: getAgentDashboard,
    enabled: !isSupervisor,
  });
  const { data: shops } = useQuery({
    queryKey: ["shops"],
    queryFn: getMyShops,
    enabled: !isSupervisor,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => updateProfile(data),
    onSuccess: (_, variables) => {
      updateUser({ name: variables.name });
      setEditName(false);
      notify.success("Имя обновлено");
    },
    onError: (e: any) => notify.error(e.message),
  });

  const pwdMutation = useMutation({
    mutationFn: (data: any) => changePassword(data),
    onSuccess: () => {
      setEditPwd(false);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      notify.success("Пароль изменён");
    },
    onError: (e: any) => notify.error(e.message),
  });

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти из аккаунта?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[...Gradients.profileHeader, colors.bg.secondary] as any}
        style={{ paddingTop: insets.top + 16, paddingBottom: 44, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: "#fff" }}>
            Профиль
          </Text>
          <TouchableOpacity
            onPress={() => setEditName(true)}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="edit-2" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Avatar + info */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.4)",
          }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 26, color: "#fff" }}>
              {(user?.name ?? "?")[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: "#fff" }}>
              {user?.name ?? "—"}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
              {user?.email ?? ""}
            </Text>
            <View style={{
              marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start",
            }}>
              <Feather name={roleMeta.icon} size={12} color="#fff" />
              <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: 11, color: "#fff" }}>
                {roleMeta.label}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1, marginTop: -20 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>

        {/* ── Role-specific stats ── */}
        {!isSupervisor && (
          <>
            <SectionHeader title="СТАТИСТИКА" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatCard label="ЗАКАЗЫ" value={kpis?.todayOrders ?? 0} icon="shopping-cart" color="#F59E0B" />
              <StatCard label="МАГАЗИНЫ" value={kpis?.assignedShops ?? 0} icon="shopping-bag" color="#6366F1" />
              <StatCard
                label="ВЫРУЧКА"
                value={`${((kpis?.todayRevenue ?? 0) / 1000).toFixed(0)}k`}
                icon="trending-up"
                color="#10B981"
              />
            </View>
          </>
        )}

        {/* ── Personal info ── */}
        <SectionHeader title="ЛИЧНЫЕ ДАННЫЕ" />
        <Card colors={colors}>
          {editName ? (
            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: 14, color: colors.text.primary, marginBottom: 4 }}>
                Изменить имя
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                style={{
                  backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 12,
                  fontFamily: Typography.fontRegular, fontSize: 14, color: colors.text.primary,
                  borderWidth: 1, borderColor: colors.border.default,
                }}
                placeholder="Введите имя"
                placeholderTextColor={colors.text.muted}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => updateMutation.mutate({ name: newName })}
                  disabled={updateMutation.isPending || !newName.trim()}
                  style={{
                    flex: 1, backgroundColor: colors.accent.primary, borderRadius: Radii.md,
                    padding: 12, alignItems: "center", opacity: updateMutation.isPending || !newName.trim() ? 0.5 : 1,
                  }}>
                  {updateMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ fontFamily: Typography.fontSemiBold, color: "#fff" }}>Сохранить</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setEditName(false); setNewName(user?.name ?? ""); }}
                  style={{ flex: 1, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <SettingRow icon="user" label={user?.name ?? "—"} sublabel="Имя"
              onPress={() => { setNewName(user?.name ?? ""); setEditName(true); }} colors={colors} />
          )}
          <Divider colors={colors} />
          <SettingRow icon="mail" label={user?.email ?? "—"} sublabel="Email" colors={colors} />
          <Divider colors={colors} />
          <SettingRow icon="shield" label={roleMeta.label} sublabel="Роль в системе" colors={colors} />
          {user?.tenant && (
            <>
              <Divider colors={colors} />
              <SettingRow icon="briefcase" label={user.tenant.name} sublabel="Компания" colors={colors} />
            </>
          )}
        </Card>

        {/* ── Security ── */}
        <SectionHeader title="БЕЗОПАСНОСТЬ" />
        <Card colors={colors}>
          {editPwd ? (
            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: 14, color: colors.text.primary, marginBottom: 4 }}>
                Сменить пароль
              </Text>
              {[
                { label: "Текущий пароль", value: currentPwd, setter: setCurrentPwd, key: "current" },
                { label: "Новый пароль", value: newPwd, setter: setNewPwd, key: "new" },
                { label: "Повторите пароль", value: confirmPwd, setter: setConfirmPwd, key: "confirm" },
              ].map((f) => (
                <TextInput
                  key={f.key}
                  value={f.value}
                  onChangeText={f.setter}
                  secureTextEntry
                  style={{
                    backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 12,
                    fontFamily: Typography.fontRegular, fontSize: 14, color: colors.text.primary,
                    borderWidth: 1, borderColor: f.key === "confirm" && confirmPwd && confirmPwd !== newPwd
                      ? colors.status.danger : colors.border.default,
                  }}
                  placeholder={f.label}
                  placeholderTextColor={colors.text.muted}
                />
              ))}
              {confirmPwd && confirmPwd !== newPwd && (
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.status.danger }}>
                  Пароли не совпадают
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  disabled={pwdMutation.isPending}
                  onPress={() => {
                    if (!currentPwd || !newPwd) return notify.error("Заполните все поля");
                    if (newPwd !== confirmPwd) return notify.error("Пароли не совпадают");
                    if (newPwd.length < 8) return notify.error("Минимум 8 символов");
                    pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
                  }}
                  style={{
                    flex: 1, backgroundColor: colors.accent.primary, borderRadius: Radii.md,
                    padding: 12, alignItems: "center",
                  }}>
                  {pwdMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ fontFamily: Typography.fontSemiBold, color: "#fff" }}>Изменить</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setEditPwd(false); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); }}
                  style={{ flex: 1, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <SettingRow icon="lock" label="Сменить пароль" sublabel="Обновить пароль аккаунта"
              onPress={() => setEditPwd(true)} colors={colors} />
          )}
        </Card>

        {/* ── Appearance ── */}
        <SectionHeader title="ОФОРМЛЕНИЕ" />
        <Card colors={colors}>
          <SettingRow
            icon={isDark ? "moon" : "sun"}
            label={isDark ? "Тёмная тема" : "Светлая тема"}
            sublabel="Переключить оформление"
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border.strong, true: colors.accent.primary }}
                thumbColor={isDark ? "#fff" : "#f0f2f8"}
              />
            }
          />
        </Card>

        {/* ── Logout ── */}
        <SectionHeader title="АККАУНТ" />
        <Card colors={colors}>
          <SettingRow icon="log-out" label="Выйти из аккаунта" danger onPress={handleLogout} colors={colors} />
        </Card>

        {/* ── Version ── */}
        <View style={{ alignItems: "center", marginTop: 16, gap: 4 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.muted }}>
            Warehouse Pro
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.muted }}>
            v1.0.0 · {roleMeta.label}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
