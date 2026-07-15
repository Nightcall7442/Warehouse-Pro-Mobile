import { useState, useEffect, useCallback } from "react";
import {
  View,
  ViewStyle,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/store/auth";
import { updateProfile, changePassword, getAgentDashboard, getMyShops } from "../../src/api";
import { useThemeStore } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { ShimmerSkeleton } from "../../src/components/Animated";
import { TextStyle } from "react-native";
import {
  WebColors,
  WebShadows,
  WebTypography,
  WebSpacing,
  WebRadii,
  createWebStyles,
} from "../../src/theme-web-match";

// Cast font weights to React Native compatible types
const FW = WebTypography.weight as Record<string, TextStyle["fontWeight"]>;

type IconName = keyof typeof Feather.glyphMap;

const ROLE_META: Record<string, { label: string; icon: IconName; color: string }> = {
  agent:        { label: "Агент",          icon: "truck",       color: WebColors.light.primary },
  supervisor:   { label: "Супервайзер",    icon: "eye",         color: WebColors.light.success },
  ceo:          { label: "Руководитель",   icon: "briefcase",   color: WebColors.light.warning },
  operator:     { label: "Оператор",       icon: "headphones",  color: WebColors.light.success },
  merchandiser: { label: "Мерчандайзер",   icon: "tag",         color: WebColors.light.success },
};

// ── Stat card for role-specific KPIs (web kpi-hero style) ────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: IconName; color: string }) {
  const { isDark } = useThemeStore();
  const styles = createWebStyles(isDark);
  const c = isDark ? WebColors.dark : WebColors.light;

  return (
    <View style={[styles.kpiHero, { flex: 1 }]}>
      <View style={{
        width: 32, height: 32, borderRadius: WebRadii.sm,
        backgroundColor: color + "18", alignItems: "center", justifyContent: "center",
        marginBottom: WebSpacing.sm,
      }}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={{
        fontFamily: WebTypography.fontFamily,
        fontSize: 28,
        fontWeight: FW.bold,
        color: c.textPrimary,
      }}>
        {value}
      </Text>
      <Text style={[styles.kpiHeroLabel, { marginTop: 2 }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  const { isDark } = useThemeStore();
  const styles = createWebStyles(isDark);
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ── Setting row (web neo-card style) ─────────────────────────────────────────
function SettingRow({
  icon, label, sublabel, right, onPress, danger, isDark,
}: {
  icon: IconName; label: string; sublabel?: string; right?: React.ReactNode;
  onPress?: () => void; danger?: boolean; isDark: boolean;
}) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;
  const styles = createWebStyles(isDark);

  const rowStyle: ViewStyle = {
    flexDirection: "row", alignItems: "center",
    paddingVertical: WebSpacing.base, paddingHorizontal: WebSpacing.lg,
    gap: WebSpacing.base,
  };

  const iconBg = danger ? c.dangerSubtle : c.primarySubtle;
  const iconColor = danger ? c.danger : c.primary;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <View style={[rowStyle, {
          backgroundColor: c.surface,
          borderRadius: WebRadii.xl,
          borderWidth: 1,
          borderColor: c.border,
          ...s.md,
          marginBottom: WebSpacing.sm,
        }]}>
          <View style={{
            width: 36, height: 36, borderRadius: WebRadii.md, alignItems: "center", justifyContent: "center",
            backgroundColor: iconBg,
          }}>
            <Feather name={icon} size={17} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontFamily: WebTypography.fontFamily,
              fontSize: WebTypography.size.base,
              fontWeight: FW.medium,
              color: danger ? c.danger : c.textPrimary,
            }}>
              {label}
            </Text>
            {sublabel && (
              <Text style={{
                fontFamily: WebTypography.fontFamily,
                fontSize: WebTypography.size.sm,
                fontWeight: FW.normal,
                color: c.textTertiary, marginTop: 2,
              }}>
                {sublabel}
              </Text>
            )}
          </View>
          {right ?? <Feather name="chevron-right" size={16} color={c.textTertiary} />}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[rowStyle, {
      backgroundColor: c.surface,
      borderRadius: WebRadii.xl,
      borderWidth: 1,
      borderColor: c.border,
      ...s.md,
      marginBottom: WebSpacing.sm,
    }]}>
      <View style={{
        width: 36, height: 36, borderRadius: WebRadii.md, alignItems: "center", justifyContent: "center",
        backgroundColor: iconBg,
      }}>
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontFamily: WebTypography.fontFamily,
          fontSize: WebTypography.size.base,
          fontWeight: FW.medium,
          color: danger ? c.danger : c.textPrimary,
        }}>
          {label}
        </Text>
        {sublabel && (
          <Text style={{
            fontFamily: WebTypography.fontFamily,
            fontSize: WebTypography.size.sm,
            fontWeight: FW.normal,
            color: c.textTertiary, marginTop: 2,
          }}>
            {sublabel}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────
function Divider({ isDark }: { isDark: boolean }) {
  const styles = createWebStyles(isDark);
  return <View style={styles.divider} />;
}

// ── Card wrapper (web neo-card style) ────────────────────────────────────────
function Card({ children, isDark, style }: { children: React.ReactNode; isDark: boolean; style?: ViewStyle }) {
  const styles = createWebStyles(isDark);
  return (
    <View style={[styles.neoCard, { marginBottom: WebSpacing.lg, overflow: "hidden" }, style]}>
      {children}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, logout, updateUser } = useAuthStore();
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;
  const styles = createWebStyles(isDark);

  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(user?.name ?? "");
  const [editPwd, setEditPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!editName && user?.name) setNewName(user.name);
  }, [user?.name, editName]);

  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const roleMeta = ROLE_META[user?.role ?? ""] ?? { label: user?.role ?? "—", icon: "user" as IconName, color: WebColors.light.primary };

  const { data: kpis, refetch: refetchKpis } = useQuery({
    queryKey: ["agentDashboard"],
    queryFn: getAgentDashboard,
    enabled: !isSupervisor,
  });
  const { refetch: refetchShops } = useQuery({
    queryKey: ["shops"],
    queryFn: getMyShops,
    enabled: !isSupervisor,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchKpis(), refetchShops()]);
    setRefreshing(false);
  };

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => updateProfile(data),
    onSuccess: (_, variables) => {
      updateUser({ name: variables.name });
      setEditName(false);
      notify.success("Имя обновлено");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const avatarMutation = useMutation({
    mutationFn: (data: { avatar: string }) => updateProfile(data),
    onSuccess: (_, variables) => {
      updateUser({ avatar: variables.avatar });
      notify.success("Аватар обновлён");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const handleAvatarPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Нужно разрешение", "Для выбора фото предоставьте доступ к галерее");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      avatarMutation.mutate({ avatar: result.assets[0].uri });
    }
  }, [avatarMutation]);

  const pwdMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => changePassword(data),
    onSuccess: () => {
      setEditPwd(false);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      notify.success("Пароль изменён");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const handleLogout = useCallback(() => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти из аккаунта?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  }, [logout]);

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + WebSpacing.xl,
        paddingBottom: WebSpacing["3xl"],
        paddingHorizontal: WebSpacing.xl,
        backgroundColor: c.canvas,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: WebSpacing.xl }}>
          <Text style={{
            fontFamily: WebTypography.fontFamily,
            fontSize: WebTypography.size.xxl,
            fontWeight: FW.bold,
            color: c.textPrimary,
          }}>
            Профиль
          </Text>
          <TouchableOpacity
            onPress={() => setEditName(true)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 36, height: 36, borderRadius: WebRadii.xl,
              backgroundColor: c.surface,
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: c.border,
            }}>
              <Feather name="edit-2" size={16} color={c.textPrimary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Avatar + info */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: WebSpacing.base }}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8}>
            <View style={styles.avatar}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={{ width: 80, height: 80, borderRadius: WebRadii.full }} />
              ) : (
                <Text style={{
                  fontFamily: WebTypography.fontFamily,
                  fontSize: WebTypography.size["2xl"],
                  fontWeight: FW.bold,
                  color: c.textPrimary,
                }}>
                  {(user?.name ?? "?")[0].toUpperCase()}
                </Text>
              )}
              <View style={{
                position: "absolute", bottom: 2, right: 2, width: 24, height: 24, borderRadius: WebRadii.full,
                backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
                borderWidth: 2, borderColor: c.canvas,
              }}>
                <Feather name="camera" size={10} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontFamily: WebTypography.fontFamily,
              fontSize: WebTypography.size.lg,
              fontWeight: FW.bold,
              color: c.textPrimary,
            }}>
              {user?.name ?? "—"}
            </Text>
            <Text style={{
              fontFamily: WebTypography.fontFamily,
              fontSize: WebTypography.size.sm,
              fontWeight: FW.normal,
              color: c.textSecondary, marginTop: 2,
            }}>
              {user?.email ?? ""}
            </Text>
            <View style={{
              marginTop: WebSpacing.sm, flexDirection: "row", alignItems: "center", gap: WebSpacing.xs,
              backgroundColor: c.primarySubtle, paddingHorizontal: WebSpacing.sm, paddingVertical: WebSpacing.xs,
              borderRadius: WebRadii.full, alignSelf: "flex-start",
            }}>
              <Feather name={roleMeta.icon} size={12} color={c.primary} />
              <Text style={{
                fontFamily: WebTypography.fontFamily,
                fontSize: WebTypography.size.xs,
                fontWeight: FW.semibold,
                color: c.primary,
              }}>
                {roleMeta.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: -WebSpacing.lg }}
        contentContainerStyle={{ paddingHorizontal: WebSpacing.lg, paddingBottom: insets.bottom + WebSpacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

        {/* ── Role-specific stats ── */}
        {!isSupervisor && (
          <>
            <SectionHeader title="СТАТИСТИКА" />
            {kpis ? (
              <View style={{ flexDirection: "row", gap: WebSpacing.sm }}>
                <StatCard label="ЗАКАЗЫ" value={kpis?.todayOrders ?? 0} icon="shopping-cart" color={WebColors.light.warning} />
                <StatCard label="МАГАЗИНЫ" value={kpis?.assignedShops ?? 0} icon="shopping-bag" color={c.primary} />
                <StatCard
                  label="ВЫРУЧКА"
                  value={`${((kpis?.todayRevenue ?? 0)).toLocaleString("ru")} сум`}
                  icon="trending-up"
                  color={WebColors.light.success}
                />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: WebSpacing.sm }}>
                <ShimmerSkeleton height={110} radius={WebRadii.lg} style={{ flex: 1 }} />
                <ShimmerSkeleton height={110} radius={WebRadii.lg} style={{ flex: 1 }} />
                <ShimmerSkeleton height={110} radius={WebRadii.lg} style={{ flex: 1 }} />
              </View>
            )}
          </>
        )}

        {/* ── Personal info ── */}
        <SectionHeader title="ЛИЧНЫЕ ДАННЫЕ" />
        <Card isDark={isDark}>
          {editName ? (
            <View style={{ padding: WebSpacing.lg, gap: WebSpacing.sm }}>
              <Text style={{
                fontFamily: WebTypography.fontFamily,
                fontSize: WebTypography.size.base,
                fontWeight: FW.semibold,
                color: c.textPrimary, marginBottom: WebSpacing.xs,
              }}>
                Изменить имя
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                style={styles.neoInput}
                placeholder="Введите имя"
                placeholderTextColor={c.textTertiary}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: WebSpacing.sm }}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    updateMutation.mutate({ name: newName });
                  }}
                  disabled={updateMutation.isPending || !newName.trim()}
                  style={[styles.neoBtnPrimary, {
                    flex: 1, opacity: updateMutation.isPending || !newName.trim() ? 0.5 : 1,
                  }]}>
                  {updateMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{
                        fontFamily: WebTypography.fontFamily,
                        fontSize: WebTypography.size.sm,
                        fontWeight: FW.semibold,
                        color: "#fff",
                      }}>Сохранить</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditName(false);
                    setNewName(user?.name ?? "");
                  }}
                  style={[styles.neoBtn, { flex: 1 }]}>
                  <Text style={{
                    fontFamily: WebTypography.fontFamily,
                    fontSize: WebTypography.size.sm,
                    fontWeight: FW.medium,
                    color: c.textSecondary,
                  }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ padding: WebSpacing.base }}>
              <SettingRow icon="user" label={user?.name ?? "—"} sublabel="Имя"
                onPress={() => { setNewName(user?.name ?? ""); setEditName(true); }} isDark={isDark} />
            </View>
          )}
          <Divider isDark={isDark} />
          <View style={{ padding: WebSpacing.base }}>
            <SettingRow icon="mail" label={user?.email ?? "—"} sublabel="Email" isDark={isDark} />
          </View>
          <Divider isDark={isDark} />
          <View style={{ padding: WebSpacing.base }}>
            <SettingRow icon="shield" label={roleMeta.label} sublabel="Роль в системе" isDark={isDark} />
          </View>
          {user?.tenant && (
            <>
              <Divider isDark={isDark} />
              <View style={{ padding: WebSpacing.base }}>
                <SettingRow icon="briefcase" label={user.tenant.name} sublabel="Компания" isDark={isDark} />
              </View>
            </>
          )}
        </Card>

        {/* ── Security ── */}
        <SectionHeader title="БЕЗОПАСНОСТЬ" />
        <Card isDark={isDark}>
          {editPwd ? (
            <View style={{ padding: WebSpacing.lg, gap: WebSpacing.sm }}>
              <Text style={{
                fontFamily: WebTypography.fontFamily,
                fontSize: WebTypography.size.base,
                fontWeight: FW.semibold,
                color: c.textPrimary, marginBottom: WebSpacing.xs,
              }}>
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
                  style={[styles.neoInput, f.key === "confirm" && confirmPwd && confirmPwd !== newPwd
                    ? { borderColor: c.danger }
                    : {}]}
                  placeholder={f.label}
                  placeholderTextColor={c.textTertiary}
                />
              ))}
              {confirmPwd && confirmPwd !== newPwd && (
                <Text style={{
                  fontFamily: WebTypography.fontFamily,
                  fontSize: WebTypography.size.sm,
                  fontWeight: FW.medium,
                  color: c.danger,
                }}>
                  Пароли не совпадают
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: WebSpacing.sm }}>
                <TouchableOpacity
                  disabled={pwdMutation.isPending}
                  onPress={() => {
                    if (!currentPwd || !newPwd) return notify.error("Заполните все поля");
                    if (newPwd !== confirmPwd) return notify.error("Пароли не совпадают");
                    if (newPwd.length < 8) return notify.error("Минимум 8 символов");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    pwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
                  }}
                  style={[styles.neoBtnPrimary, { flex: 1 }]}>
                  {pwdMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{
                        fontFamily: WebTypography.fontFamily,
                        fontSize: WebTypography.size.sm,
                        fontWeight: FW.semibold,
                        color: "#fff",
                      }}>Изменить</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditPwd(false);
                    setCurrentPwd("");
                    setNewPwd("");
                    setConfirmPwd("");
                  }}
                  style={[styles.neoBtn, { flex: 1 }]}>
                  <Text style={{
                    fontFamily: WebTypography.fontFamily,
                    fontSize: WebTypography.size.sm,
                    fontWeight: FW.medium,
                    color: c.textSecondary,
                  }}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ padding: WebSpacing.base }}>
              <SettingRow icon="lock" label="Сменить пароль" sublabel="Обновить пароль аккаунта"
                onPress={() => setEditPwd(true)} isDark={isDark} />
            </View>
          )}
        </Card>

        {/* ── Appearance ── */}
        <SectionHeader title="ОФОРМЛЕНИЕ" />
        <Card isDark={isDark}>
          <View style={{ padding: WebSpacing.base }}>
            <SettingRow
              icon={isDark ? "moon" : "sun"}
              label={isDark ? "Тёмная тема" : "Светлая тема"}
              sublabel="Переключить оформление"
              isDark={isDark}
              right={
                <Switch
                  value={isDark}
                  onValueChange={() => {
                    Haptics.selectionAsync();
                    toggleTheme();
                  }}
                  trackColor={{ false: c.border, true: c.primary }}
                  thumbColor={isDark ? c.primary : "#fff"}
                />
              }
            />
          </View>
        </Card>

        {/* ── Logout ── */}
        <SectionHeader title="АККАУНТ" />
        <Card isDark={isDark}>
          <View style={{ padding: WebSpacing.base }}>
            <SettingRow icon="log-out" label="Выйти из аккаунта" danger onPress={handleLogout} isDark={isDark} />
          </View>
        </Card>

        {/* ── Version ── */}
        <View style={{ alignItems: "center", marginTop: WebSpacing.lg, gap: WebSpacing.xs }}>
          <Text style={{
            fontFamily: WebTypography.fontFamily,
            fontSize: WebTypography.size.sm,
            fontWeight: FW.medium,
            color: c.textTertiary,
          }}>
            Warehouse Pro
          </Text>
          <Text style={{
            fontFamily: WebTypography.fontFamily,
            fontSize: WebTypography.size.xs,
            fontWeight: FW.normal,
            color: c.textTertiary,
          }}>
            v1.0.0 · {roleMeta.label}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
