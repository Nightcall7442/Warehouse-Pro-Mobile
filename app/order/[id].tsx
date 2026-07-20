import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { notify } from "../../src/store/toast";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import * as Haptics from "expo-haptics";
import {
  getOrderById,
  cancelOrder,
  updateOrder,
  type OrderDetail,
} from "../../src/api";
import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
} from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { Card, IconCircle, Badge } from "../../src/components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale, FadeInItem } from "../../src/components/Animated";

// ── Status config ─────────────────────────────────────────────────────────────
type IconName = keyof typeof Feather.glyphMap;

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    gradient: readonly [string, string];
    icon: IconName;
    badgeVariant: "info" | "warning" | "success" | "danger";
    step: number; // 0-based index in pipeline
  }
> = {
  new:        { label: "Новый",       gradient: ["#4a9de8","#4b6cf6"], icon: "file-text",    badgeVariant: "info",    step: 0 },
  processing: { label: "В обработке", gradient: ["#e8a830","#f09050"], icon: "loader",       badgeVariant: "warning", step: 1 },
  completed:  { label: "Выполнен",    gradient: ["#34c473","#2ec4b0"], icon: "check-circle", badgeVariant: "success", step: 2 },
  cancelled:  { label: "Отменён",     gradient: ["#e85050","#f06895"], icon: "x-circle",     badgeVariant: "danger",  step: -1 },
};

const PIPELINE_STEPS = ["Новый", "В обработке", "Выполнен"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMMM yyyy, HH:mm", { locale: ru }); }
  catch { return dateStr; }
}

function money(val: string | number | undefined | null) {
  const num = typeof val === "number" ? val : Number(String(val ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  if (isNaN(num) || !isFinite(num)) return "0 сум";
  return num.toLocaleString("ru") + " сум";
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated pulsing skeleton row */
function SkeletonRow({ w = "60%", h = 14, colors }: { w?: number | `${number}%`; h?: number; colors: ThemeColors }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900 }),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));
  return (
    <Animated.View
      style={[
        {
          height: h,
          width: w,
          borderRadius: 6,
          backgroundColor: colors.bg.elevated,
          marginVertical: 4,
        },
        animatedStyle,
      ]}
    />
  );
}

function LoadingState({ colors }: { colors: ThemeColors }) {
  const styles = makeStyles(colors);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} scrollEnabled={false}>
      <View style={styles.skeletonHeader}>
        <View style={{ width: 40, height: 40, borderRadius: Radii.full, backgroundColor: colors.bg.elevated }} />
        <SkeletonRow w="50%" h={22} colors={colors} />
      </View>
      <View style={[styles.heroBanner, { backgroundColor: colors.bg.elevated }]} />
      <Card style={{ marginBottom: Spacing.base, gap: 12 }}>
        <SkeletonRow w="40%" h={14} colors={colors} />
        <SkeletonRow w="70%" h={18} colors={colors} />
        <SkeletonRow w="55%" h={14} colors={colors} />
        <SkeletonRow w="65%" h={18} colors={colors} />
      </Card>
      <Card style={{ gap: 12 }}>
        <SkeletonRow w="30%" h={14} colors={colors} />
        {[1, 2, 3].map(i => <SkeletonRow key={i} w="90%" h={14} colors={colors} />)}
      </Card>
    </ScrollView>
  );
}

/** Pipeline tracker — shows progress or cancelled */
function PipelineBanner({ status, colors }: { status: string; colors: ThemeColors }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  if (status === "cancelled") {
    return (
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.base, borderColor: colors.status.danger + "30", borderWidth: 1 }}>
        <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x-circle" size={28} color={colors.status.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary, marginBottom: 10 }}>Заказ отменён</Text>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>Этот заказ был отменён и не обрабатывается</Text>
        </View>
      </Card>
    );
  }
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.base, borderColor: colors.status[cfg.badgeVariant] + "20", borderWidth: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary }}>{cfg.label}</Text>
          <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {PIPELINE_STEPS.map((step, i) => {
            const done = i <= cfg.step;
            const active = i === cfg.step;
            return (
              <View key={step} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 18, height: 18, borderRadius: Radii.full,
                  backgroundColor: done ? colors.accent.primary : colors.border.subtle,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: active ? 2 : 0, borderColor: active ? colors.accent.primary : "transparent",
                }}>
                  {done && !active && <Feather name="check" size={9} color="#fff" />}
                  {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent.primary + "40" }} />}
                </View>
                <Text style={{ fontSize: Typography.size.xs, color: done ? colors.text.primary : colors.text.muted, marginHorizontal: 4, fontFamily: Typography.fontMedium }}>{step}</Text>
                {i < PIPELINE_STEPS.length - 1 && (
                  <View style={{ width: 16, height: 2, backgroundColor: done && i < cfg.step ? colors.accent.primary : colors.border.subtle, borderRadius: 1 }} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.status[cfg.badgeVariant] + "12", alignItems: "center", justifyContent: "center" }}>
        <Feather name={cfg.icon} size={32} color={colors.status[cfg.badgeVariant]} />
      </View>
    </Card>
  );
}

/** Info row inside a card */
function InfoRow({ icon, label, value, accent, colors }: { icon: IconName; label: string; value: string; accent?: boolean; colors: ThemeColors }) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={14} color={colors.brand.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, accent && styles.infoValueAccent]}>{value}</Text>
      </View>
    </View>
  );
}

/** Single product line in the order */
function ItemRow({ name, code, qty, price, discount, total, colors }: {
  name: string; code?: string; qty: number; price: number; discount?: number; total: number; colors: ThemeColors;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName} numberOfLines={2}>{name}</Text>
        {code && <Text style={styles.itemCode}>{code}</Text>}
        <View style={styles.itemMeta}>
          <Text style={styles.itemQty}>{qty} шт.</Text>
          {!!discount && discount > 0 && (
            <View style={styles.discountChip}>
              <Feather name="tag" size={10} color={colors.status.success} />
              <Text style={styles.discountText}>−{discount}%</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemTotal}>{money(total)}</Text>
        <Text style={styles.itemPrice}>{money(price)} / шт.</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets.top);
  const queryClient = useQueryClient();
  const fadeIn = useSharedValue(0);

  // Primary: try dedicated endpoint
  const { data: order, isLoading, isError, refetch, isFetching } = useQuery<OrderDetail>({
    queryKey: ["order", id],
    queryFn: async () => {
      try {
        return await getOrderById(Number(id));
      } catch {
        throw new Error("Заказ не найден");
      }
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(Number(id)),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error("Не удалось отменить заказ. Попробуйте ещё раз.");
    },
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => updateOrder(Number(id), { notes: editNotes || undefined, discount: editDiscount || undefined }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Заказ обновлён");
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error("Не удалось обновить заказ");
    },
  });

  useEffect(() => {
    if (order) {
      fadeIn.value = withTiming(1, { duration: 350 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const fadeInStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  function handleShare() {
    if (!order) return;
    Share.share({
      title: `Заказ #${order.orderNumber}`,
      message: `Заказ #${order.orderNumber}\nМагазин: ${order.shopName ?? "—"}\nСумма: ${money(order.total)}\nСтатус: ${STATUS_CONFIG[order.status]?.label ?? order.status}`,
    });
  }

  function handleCancel() {
    Alert.alert(
      "Отменить заказ?",
      "Это действие нельзя отменить.",
      [
        { text: "Нет", style: "cancel" },
        {
          text: "Да, отменить",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            cancelMutation.mutate();
          },
        },
      ]
    );
  }

  function handleEditOpen() {
    setEditNotes(order?.notes ?? "");
    setEditDiscount(order?.discount != null ? String(order.discount) : "");
    setShowEditModal(true);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingState colors={colors} />;

  // ── Error / not found ──────────────────────────────────────────────────────
  if (isError || !order) {
    return (
      <View style={styles.centered}>
        <View style={[styles.errorIcon, { backgroundColor: colors.status.dangerDim }]}>
          <Feather name="alert-triangle" size={28} color={colors.status.danger} />
        </View>
        <Text style={styles.errorTitle}>Заказ не найден</Text>
        <Text style={styles.errorSub}>Возможно, он был удалён или у вас нет доступа.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errorBtn, { backgroundColor: colors.brand.primary, borderRadius: Radii.xl }]}>
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={styles.errorBtnText}>Назад к заказам</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canCancel = order.status === "new" || order.status === "processing";
  const subtotal = order.subtotal ?? order.total;
  const discount = order.discount ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Fixed top bar ── */}
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          haptic="light"
          style={styles.topBarBack}
        >
          <Feather name="arrow-left" size={22} color={colors.text.primary} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Заказ #{order.orderNumber}</Text>
          <Text style={styles.topBarSub}>{fmt(order.createdAt)}</Text>
        </View>
        <PressableScale onPress={handleShare} haptic="light" style={styles.topBarAction}>
          <Feather name="share-2" size={18} color={colors.brand.primaryLight} />
        </PressableScale>
      </View>

      <Animated.View style={[{ flex: 1 }, fadeInStyle]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.accent.primary} />}
        >
        {/* ── Status hero banner / pipeline ── */}
        <PipelineBanner status={order.status} colors={colors} />

        {/* ── Summary card ── */}
        <FadeInItem delay={0}>
          <Card style={{ marginBottom: Spacing.sm, padding: 0, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: Spacing.base, paddingBottom: 12 }}>
              <IconCircle name="info" size={15} variant="brand" />
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Информация</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />
            <InfoRow icon="hash"        label="Номер заказа"  value={`#${order.orderNumber}`} colors={colors} />
            <InfoRow icon="calendar"    label="Дата создания" value={fmt(order.createdAt)} colors={colors} />
            <InfoRow icon="shopping-bag" label="Магазин"      value={order.shopName ?? "Не указан"} colors={colors} />
            {order.agentName && <InfoRow icon="user"          label="Агент"        value={order.agentName} colors={colors} />}
            {order.address   && <InfoRow icon="map-pin"       label="Адрес"        value={order.address} colors={colors} />}
            {order.notes     && <InfoRow icon="file-text"     label="Заметки"      value={order.notes} colors={colors} />}
          </Card>
        </FadeInItem>

        {/* ── Items list ── */}
        <FadeInItem delay={40}>
          {order.items && order.items.length > 0 ? (
            <Card style={{ marginBottom: Spacing.sm, padding: 0, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: Spacing.base, paddingBottom: 12 }}>
                <IconCircle name="package" size={15} variant="brand" />
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Товары ({order.items.length})</Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />
              {order.items.map((item, idx) => (
                <View key={item.id ?? idx}>
                  <ItemRow
                    name={item.productName}
                    code={item.productCode}
                    qty={item.quantity}
                    price={Number(item.unitPrice) || 0}
                    discount={item.discount}
                    total={Number(item.total) || 0}
                    colors={colors}
                  />
                  {idx < order.items.length - 1 && <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />}
                </View>
              ))}
            </Card>
          ) : (
            <Card style={{ marginBottom: Spacing.sm, alignItems: "center", paddingVertical: 32, gap: 10 }}>
              <Feather name="package" size={28} color={colors.text.muted} />
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>Список товаров недоступен</Text>
            </Card>
          )}
        </FadeInItem>

        {/* ── Financial summary ── */}
        <FadeInItem delay={80}>
          <Card style={{ marginBottom: Spacing.sm, padding: 0, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: Spacing.base, paddingBottom: 12 }}>
              <IconCircle name="dollar-sign" size={15} variant="brand" />
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Итог</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.base, paddingVertical: 10 }}>
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary }}>Сумма товаров</Text>
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary }}>{money(subtotal)}</Text>
            </View>
            {discount > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.base, paddingVertical: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="tag" size={13} color={colors.status.success} />
                  <Text style={{ fontSize: Typography.size.sm, color: colors.status.success }}>Скидка</Text>
                </View>
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.status.success }}>−{discount}%</Text>
              </View>
            )}
            <View style={{ height: 1, backgroundColor: colors.border.default, marginHorizontal: Spacing.base, marginVertical: 4 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, paddingTop: 10 }}>
              <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary }}>Итого</Text>
              <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: "#fff" }}>{money(order.total)}</Text>
              </View>
            </View>
          </Card>
        </FadeInItem>

        {/* ── Actions ── */}
        <FadeInItem delay={120}>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <PressableScale onPress={handleEditOpen} haptic="light" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
              <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default }}>
                <Feather name="edit-2" size={18} color={colors.text.primary} />
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Изменить</Text>
              </Card>
            </PressableScale>
            {canCancel && (
              <PressableScale onPress={handleCancel} haptic="medium" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
                <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "40" }}>
                  {cancelMutation.isPending
                    ? <ActivityIndicator size="small" color={colors.status.danger} />
                    : <Feather name="x" size={18} color={colors.status.danger} />
                  }
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger }}>Отменить заказ</Text>
                </Card>
              </PressableScale>
            )}
          </View>
        </FadeInItem>

        <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setShowEditModal(false)}>
          <Pressable style={{
            position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "60%",
            backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
          }} onPress={e => e.stopPropagation()}>
            <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
              <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.lg }}>Редактировать заказ</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Заметки</Text>
            <TextInput value={editNotes} onChangeText={setEditNotes} placeholder="Заметки к заказу..."
              placeholderTextColor={colors.text.muted}
              style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, marginBottom: Spacing.lg, minHeight: 60, textAlignVertical: "top" }} multiline />
            <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Скидка (%)</Text>
            <TextInput value={editDiscount} onChangeText={setEditDiscount} placeholder="0" keyboardType="numeric"
              placeholderTextColor={colors.text.muted}
              style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, marginBottom: Spacing.xl }} />
            <TouchableOpacity onPress={() => updateMutation.mutate()} disabled={updateMutation.isPending}
              style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: updateMutation.isPending ? 0.6 : 1 }}>
              {updateMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Сохранить</Text>
              }
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(colors: ThemeColors, topInset: number = 56) {
  return {
    root: { flex: 1, backgroundColor: colors.bg.primary },
    container: { flex: 1, backgroundColor: colors.bg.primary },
    content: { padding: Spacing.base, paddingTop: 0 },

    // Top bar
    topBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: Spacing.base,
      paddingTop: topInset + 8,
      paddingBottom: 14,
      backgroundColor: colors.bg.secondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    topBarBack: {
      width: 40, height: 40, borderRadius: Radii.full,
      backgroundColor: colors.bg.elevated,
      alignItems: "center" as const, justifyContent: "center" as const,
    },
    topBarTitle: { fontSize: Typography.size.md, fontFamily: Typography.fontBold, color: colors.text.primary },
    topBarSub: { fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 },
    topBarAction: {
      width: 40, height: 40, borderRadius: Radii.full,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const, justifyContent: "center" as const,
    },

    // Hero banner (used by LoadingState)
    heroBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 16,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      marginTop: Spacing.base,
      marginBottom: Spacing.base,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: Radii.lg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    heroTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: 10 },
    heroSub: { fontSize: Typography.size.sm },

    // Info rows (used by InfoRow component)
    infoRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 12, paddingHorizontal: Spacing.base, paddingVertical: 10 },
    infoIcon: {
      width: 28, height: 28, borderRadius: Radii.sm,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const, justifyContent: "center" as const,
      marginTop: 2,
    },
    infoLabel: { fontSize: Typography.size.xs, color: colors.text.muted, marginBottom: 3 },
    infoValue: { fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary },
    infoValueAccent: { color: colors.accent.primary },

    // Items (used by ItemRow component)
    itemRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, paddingHorizontal: Spacing.base, paddingVertical: 12 },
    itemLeft: { flex: 1, marginRight: 12 },
    itemRight: { alignItems: "flex-end" as const },
    itemName: { fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary, marginBottom: 3 },
    itemCode: { fontSize: Typography.size.xs, color: colors.text.muted, marginBottom: 4, fontFamily: Typography.fontMono },
    itemMeta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    itemQty: { fontSize: Typography.size.xs, color: colors.text.secondary, fontFamily: Typography.fontMedium },
    discountChip: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 3,
      backgroundColor: colors.status.successDim,
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.sm,
    },
    discountText: { fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontSemibold },
    itemTotal: { fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.text.primary },
    itemPrice: { fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 },
    itemDivider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base },

    // Empty items
    emptyItemsCard: { alignItems: "center" as const, paddingVertical: 32, gap: 10 },
    emptyItemsText: { fontSize: Typography.size.sm, color: colors.text.muted },

    // Skeleton header
    skeletonHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 20 },

    // Centered error
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const, padding: Spacing.xl, gap: 14 },
    errorIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center" as const, justifyContent: "center" as const },
    errorTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary },
    errorSub: { fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center" as const },
    errorBtn: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 20, paddingVertical: 12,
      borderRadius: Radii.xl, marginTop: 8,
    },
    errorBtnText: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: "#fff" },
  };
}
