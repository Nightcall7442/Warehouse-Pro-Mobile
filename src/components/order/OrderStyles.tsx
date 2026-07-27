import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
} from "../../theme";
import { Feather } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export type IconName = keyof typeof Feather.glyphMap;

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
  new:        { label: "Новый",       gradient: ["#4a9de8","#4b6cf6"], icon: "file-text",    badgeVariant: "info",    step: 0 },
  processing: { label: "В обработке", gradient: ["#e8a830","#f09050"], icon: "loader",       badgeVariant: "warning", step: 1 },
  completed:  { label: "Выполнен",    gradient: ["#34c473","#2ec4b0"], icon: "check-circle", badgeVariant: "success", step: 2 },
  cancelled:  { label: "Отменён",     gradient: ["#e85050","#f06895"], icon: "x-circle",     badgeVariant: "danger",  step: -1 },
};

export const PIPELINE_STEPS = ["Новый", "В обработке", "Выполнен"];

export function fmt(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMMM yyyy, HH:mm", { locale: ru }); }
  catch { return dateStr; }
}

export function money(val: string | number | undefined | null) {
  const num = typeof val === "number" ? val : Number(String(val ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  if (isNaN(num) || !isFinite(num)) return "0 сум";
  return num.toLocaleString("ru") + " сум";
}

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
