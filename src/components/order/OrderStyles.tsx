import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
  OrderStatusGradients,
} from "../../theme";
import { Feather } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { formatMoney } from "../../store/branding";
import { ORDER_STATUSES } from "../../lib/order-status";

export type IconName = keyof typeof Feather.glyphMap;

/**
 * Оформление статуса на экране заказа: градиент, значок, вид плашки, шаг.
 *
 * Слово берётся из общего справочника, а не пишется здесь. Таблиц названий было
 * две, и они разошлись: тот же заказ на главной звался «В работе», а здесь — «В
 * обработке», и агент думал, что статус сменился, пока он листал. Оформление
 * остаётся местным: главной нужен один плоский цвет, а не градиент из двух, и
 * тянуть туда весь этот модуль ради слова незачем.
 */
export const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    gradient: readonly [string, string];
    icon: IconName;
    badgeVariant: "info" | "warning" | "success" | "danger";
    step: number;
  }
> = {
  new:                  { label: ORDER_STATUSES.new.label,                 gradient: OrderStatusGradients.new,                 icon: "file-text",    badgeVariant: "info",    step: 0 },
  processing:           { label: ORDER_STATUSES.processing.label,          gradient: OrderStatusGradients.processing,          icon: "loader",       badgeVariant: "warning", step: 1 },
  shipped:              { label: ORDER_STATUSES.shipped.label,             gradient: OrderStatusGradients.shipped,             icon: "truck",        badgeVariant: "info",    step: 2 },
  pending:              { label: ORDER_STATUSES.pending.label,             gradient: OrderStatusGradients.pending,             icon: "clock",        badgeVariant: "warning", step: 2 },
  delivered:            { label: ORDER_STATUSES.delivered.label,           gradient: OrderStatusGradients.delivered,           icon: "check-circle", badgeVariant: "success", step: 3 },
  cancelled:            { label: ORDER_STATUSES.cancelled.label,           gradient: OrderStatusGradients.cancelled,           icon: "x-circle",     badgeVariant: "danger",  step: -1 },
  returned:             { label: ORDER_STATUSES.returned.label,            gradient: OrderStatusGradients.returned,            icon: "rotate-ccw",   badgeVariant: "danger",  step: -1 },
  partially_returned:   { label: ORDER_STATUSES.partially_returned.label,  gradient: OrderStatusGradients.partially_returned,  icon: "rotate-ccw",   badgeVariant: "warning", step: 2 },
  partial_return_kept:  { label: ORDER_STATUSES.partial_return_kept.label, gradient: OrderStatusGradients.partial_return_kept, icon: "package",      badgeVariant: "warning", step: 2 },
};

// Шаги диаграммы — те же слова, что и у статусов: «Отгружён» через ё здесь и
// «Отгружен» на главной читались как два разных состояния.
export const PIPELINE_STEPS = [
  ORDER_STATUSES.new.label,
  ORDER_STATUSES.processing.label,
  ORDER_STATUSES.shipped.label,
  ORDER_STATUSES.delivered.label,
];

export function fmt(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMMM yyyy, HH:mm", { locale: ru }); }
  catch { return dateStr; }
}

/**
 * Сумма со знаком валюты организации.
 *
 * Знак был вписан сюда строкой («сум») — организация, торгующая в другой
 * валюте, видела свои цены подписанными чужими деньгами. Расчёт переехал в
 * хранилище бренда, где знак и его сторона приходят из настроек арендатора;
 * здесь остаётся имя, которым его зовут экраны заказов.
 */
export const money = formatMoney;

export function makeStyles(colors: ThemeColors, topInset: number = 56) {
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

    // Hero banner
    heroBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 16,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      marginTop: Spacing.base,
      marginBottom: Spacing.base,
    },

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
    infoValueAccent: { color: colors.accent.primary },

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
    discountText: { fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontSemibold },
    itemTotal: { fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.text.primary },
    itemPrice: { fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 },
    itemDivider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base },

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
