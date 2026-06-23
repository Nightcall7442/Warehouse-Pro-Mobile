import { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Share,
  Alert,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { notify } from "../../src/store/toast";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  getMyOrders,
  getOrderById,
  cancelOrder,
  type OrderDetail,
} from "../../src/api";
import {
  Typography,
  Spacing,
  Radii,
  Gradients,
  Shadows,
  ThemeColors,
} from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { Badge, Card, IconCircle } from "../../src/components/ui";

const { width: SCREEN_W } = Dimensions.get("window");

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
  new:        { label: "Новый",       gradient: ["#38BDF8","#0EA5E9"], icon: "file-text",    badgeVariant: "info",    step: 0 },
  processing: { label: "В обработке", gradient: ["#F5A524","#F76B1C"], icon: "loader",       badgeVariant: "warning", step: 1 },
  completed:  { label: "Выполнен",    gradient: ["#22D3A8","#16A38A"], icon: "check-circle", badgeVariant: "success", step: 2 },
  cancelled:  { label: "Отменён",     gradient: ["#F4516C","#D63A6A"], icon: "x-circle",     badgeVariant: "danger",  step: -1 },
};

const PIPELINE_STEPS = ["Новый", "В обработке", "Выполнен"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMMM yyyy, HH:mm", { locale: ru }); }
  catch { return dateStr; }
}

function money(val: string | number) {
  return Number(val).toLocaleString("ru") + " сум";
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated pulsing skeleton row */
function SkeletonRow({ w = "60%", h = 14, colors }: { w?: number | `${number}%`; h?: number; colors: ThemeColors }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        height: h,
        width: w,
        borderRadius: 6,
        backgroundColor: colors.bg.elevated,
        opacity: pulse,
        marginVertical: 4,
      }}
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
  const styles = makeStyles(colors);
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  if (status === "cancelled") {
    return (
      <LinearGradient colors={cfg.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBanner}>
        <Feather name="x-circle" size={32} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Заказ отменён</Text>
          <Text style={styles.heroSub}>Этот заказ был отменён и не обрабатывается</Text>
        </View>
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={cfg.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBanner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroTitle}>{cfg.label}</Text>
        <View style={styles.pipeline}>
          {PIPELINE_STEPS.map((step, i) => {
            const done = i <= cfg.step;
            const active = i === cfg.step;
            return (
              <View key={step} style={styles.pipelineItem}>
                <View
                  style={[
                    styles.pipelineDot,
                    done && styles.pipelineDotDone,
                    active && styles.pipelineDotActive,
                  ]}
                >
                  {done && !active && <Feather name="check" size={9} color={cfg.gradient[0]} />}
                  {active && <View style={styles.pipelineDotInner} />}
                </View>
                <Text style={[styles.pipelineLabel, done && styles.pipelineLabelDone]}>{step}</Text>
                {i < PIPELINE_STEPS.length - 1 && (
                  <View style={[styles.pipelineLine, done && i < cfg.step && styles.pipelineLineDone]} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      <Feather name={cfg.icon} size={42} color="rgba(255,255,255,0.25)" />
    </LinearGradient>
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
  const styles = makeStyles(colors);
  const queryClient = useQueryClient();
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Primary: try dedicated endpoint
  const { data: order, isLoading, isError } = useQuery<OrderDetail>({
    queryKey: ["order", id],
    queryFn: async () => {
      try {
        return await getOrderById(Number(id));
      } catch {
        // Fallback: find in list
        const list = await getMyOrders();
        const found = list.find(o => o.id === Number(id));
        if (!found) throw new Error("Not found");
        return { ...found, items: [], subtotal: found.total };
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

  useEffect(() => {
    if (order) {
      Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [order]);

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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingState colors={colors} />;

  // ── Error / not found ──────────────────────────────────────────────────────
  if (isError || !order) {
    return (
      <View style={styles.centered}>
        <LinearGradient colors={Gradients.danger} style={styles.errorIcon}>
          <Feather name="alert-triangle" size={28} color="#fff" />
        </LinearGradient>
        <Text style={styles.errorTitle}>Заказ не найден</Text>
        <Text style={styles.errorSub}>Возможно, он был удалён или у вас нет доступа.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorBtn}>
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={styles.errorBtnText}>Назад к заказам</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.new;
  const canCancel = order.status === "new" || order.status === "processing";
  const subtotal = order.subtotal ?? order.total;
  const discount = order.discount ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Fixed top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          style={styles.topBarBack}
        >
          <Feather name="arrow-left" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Заказ #{order.orderNumber}</Text>
          <Text style={styles.topBarSub}>{fmt(order.createdAt)}</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.topBarAction}>
          <Feather name="share-2" size={18} color={colors.brand.primaryLight} />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeIn }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status hero banner / pipeline ── */}
        <PipelineBanner status={order.status} colors={colors} />

        {/* ── Summary card ── */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <IconCircle name="info" size={15} variant="brand" />
            <Text style={styles.cardTitle}>Информация</Text>
          </View>
          <View style={styles.divider} />
          <InfoRow icon="hash"        label="Номер заказа"  value={`#${order.orderNumber}`} colors={colors} />
          <InfoRow icon="calendar"    label="Дата создания" value={fmt(order.createdAt)} colors={colors} />
          <InfoRow icon="shopping-bag" label="Магазин"      value={order.shopName ?? "Не указан"} colors={colors} />
          {order.agentName && <InfoRow icon="user"          label="Агент"        value={order.agentName} colors={colors} />}
          {order.address   && <InfoRow icon="map-pin"       label="Адрес"        value={order.address} colors={colors} />}
          {order.notes     && <InfoRow icon="file-text"     label="Заметки"      value={order.notes} colors={colors} />}
        </Card>

        {/* ── Items list ── */}
        {order.items && order.items.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <IconCircle name="package" size={15} variant="brand" />
              <Text style={styles.cardTitle}>Товары ({order.items.length})</Text>
            </View>
            <View style={styles.divider} />
            {order.items.map((item, idx) => (
              <View key={item.id ?? idx}>
                <ItemRow
                  name={item.productName}
                  code={item.productCode}
                  qty={item.quantity}
                  price={item.unitPrice}
                  discount={item.discount}
                  total={item.total}
                  colors={colors}
                />
                {idx < order.items.length - 1 && <View style={styles.itemDivider} />}
              </View>
            ))}
          </Card>
        ) : (
          <Card style={[styles.card, styles.emptyItemsCard]}>
            <Feather name="package" size={28} color={colors.text.muted} />
            <Text style={styles.emptyItemsText}>Список товаров недоступен</Text>
          </Card>
        )}

        {/* ── Financial summary ── */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <IconCircle name="dollar-sign" size={15} variant="brand" />
            <Text style={styles.cardTitle}>Итог</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.finRow}>
            <Text style={styles.finLabel}>Сумма товаров</Text>
            <Text style={styles.finValue}>{money(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.finRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="tag" size={13} color={colors.status.success} />
                <Text style={[styles.finLabel, { color: colors.status.success }]}>Скидка</Text>
              </View>
              <Text style={[styles.finValue, { color: colors.status.success }]}>−{discount}%</Text>
            </View>
          )}
          <View style={styles.finDivider} />
          <View style={styles.finRowTotal}>
            <Text style={styles.finLabelTotal}>Итого</Text>
            <LinearGradient colors={cfg.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.finTotalChip}>
              <Text style={styles.finTotalText}>{money(order.total)}</Text>
            </LinearGradient>
          </View>
        </Card>

        {/* ── Actions ── */}
        <View style={styles.actions}>
          {canCancel && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger]}
              onPress={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending
                ? <ActivityIndicator size="small" color={colors.status.danger} />
                : <Feather name="x" size={18} color={colors.status.danger} />
              }
              <Text style={styles.actionBtnTextDanger}>Отменить заказ</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleShare}>
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGradient}>
              <Feather name="share-2" size={18} color="#fff" />
              <Text style={styles.actionBtnTextPrimary}>Поделиться</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(colors: ThemeColors) {
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
      paddingTop: 56,
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

    // Hero banner
    heroBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 16,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      marginTop: Spacing.base,
      marginBottom: Spacing.base,
      overflow: "hidden" as const,
    },
    heroTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: "#fff", marginBottom: 10 },
    heroSub: { fontSize: Typography.size.sm, color: "rgba(255,255,255,0.8)" },

    // Pipeline
    pipeline: { flexDirection: "row" as const, alignItems: "center" as const },
    pipelineItem: { flexDirection: "row" as const, alignItems: "center" as const },
    pipelineDot: {
      width: 18, height: 18, borderRadius: Radii.full,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center" as const, justifyContent: "center" as const,
    },
    pipelineDotDone: { backgroundColor: "#fff" },
    pipelineDotActive: { backgroundColor: "#fff", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
    pipelineDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6366F1" },
    pipelineLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", marginHorizontal: 4, fontFamily: Typography.fontMedium },
    pipelineLabelDone: { color: "#fff" },
    pipelineLine: { width: 16, height: 2, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 1 },
    pipelineLineDone: { backgroundColor: "rgba(255,255,255,0.7)" },

    // Card
    card: { marginBottom: Spacing.sm, padding: 0, overflow: "hidden" as const },
    cardHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, padding: Spacing.base, paddingBottom: 12 },
    cardTitle: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary },
    divider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base },

    // Info rows
    infoRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 12, paddingHorizontal: Spacing.base, paddingVertical: 10 },
    infoIcon: {
      width: 28, height: 28, borderRadius: Radii.sm,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const, justifyContent: "center" as const,
      marginTop: 2,
    },
    infoLabel: { fontSize: Typography.size.xs, color: colors.text.muted, marginBottom: 3 },
    infoValue: { fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary },
    infoValueAccent: { color: colors.brand.primary },

    // Items
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
    discountText: { fontSize: 10, color: colors.status.success, fontFamily: Typography.fontSemibold },
    itemTotal: { fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.text.primary },
    itemPrice: { fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 },
    itemDivider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base },

    // Empty items
    emptyItemsCard: { alignItems: "center" as const, paddingVertical: 32, gap: 10 },
    emptyItemsText: { fontSize: Typography.size.sm, color: colors.text.muted },

    // Financials
    finRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingHorizontal: Spacing.base, paddingVertical: 10 },
    finLabel: { fontSize: Typography.size.sm, color: colors.text.secondary },
    finValue: { fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.text.primary },
    finDivider: { height: 1, backgroundColor: colors.border.default, marginHorizontal: Spacing.base, marginVertical: 4 },
    finRowTotal: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, paddingTop: 10 },
    finLabelTotal: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary },
    finTotalChip: { borderRadius: Radii.md, paddingHorizontal: 14, paddingVertical: 7 },
    finTotalText: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: "#fff" },

    // Actions
    actions: { flexDirection: "row" as const, gap: 12, marginTop: 8 },
    actionBtn: { flex: 1, borderRadius: Radii.lg, overflow: "hidden" as const },
    actionBtnDanger: {
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8,
      paddingVertical: 14, paddingHorizontal: 16,
      backgroundColor: colors.status.dangerDim,
      borderWidth: 1, borderColor: colors.status.danger + "40",
    },
    actionBtnPrimary: {},
    actionBtnGradient: {
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8,
      paddingVertical: 14, paddingHorizontal: 16,
    },
    actionBtnTextDanger: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger },
    actionBtnTextPrimary: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: "#fff" },

    // Skeleton header
    skeletonHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 20 },

    // Centered error
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const, padding: Spacing.xl, gap: 14 },
    errorIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center" as const, justifyContent: "center" as const },
    errorTitle: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary },
    errorSub: { fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center" as const },
    errorBtn: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 20, paddingVertical: 12,
      borderRadius: Radii.md, marginTop: 8,
    },
    errorBtnText: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: "#fff" },
  };
}
