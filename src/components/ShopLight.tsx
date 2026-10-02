import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors, useThemeStore } from "../store/theme";
import { Typography, Spacing, Radii, soft, type ThemeColors } from "../theme";
import { useT, useLang } from "../i18n";
import { formatMoney } from "../store/branding";
import type { ShopLight, ShopLightColor } from "../api";
import { lightColorLabel, lightReasonText, SHOP_LIGHT_RULES } from "../lib/shop-light";
import { isNoOrderReason, noOrderReasonText } from "../lib/no-order-reason";
import { useShopLight } from "../hooks/useShopLights";
import { lightStamp } from "../lib/shop-light-cache";

/*
  Светофор магазина: точка у названия в списке и сводка в карточке.

  ── Что было ────────────────────────────────────────────────────────────────

  У прилавка агент видел только сумму долга. Что часть его просрочена, что
  лимит почти выбран, что магазин месяц не заказывает при обычной неделе —
  узнавал, когда заказ уже вставал на проверку офиса, или не узнавал вовсе.

  ── Как теперь ──────────────────────────────────────────────────────────────

  Цвет и причины считает сервер (shop.light / shop.lights), правила и фразы —
  копия контракта веба (lib/shop-light). Здесь ничего не считается: экран
  печатает цвет, причину словами и цифры, из которых она сложилась, — как
  ShopLight.tsx веба (#155). Без связи — последний полученный ответ с
  пометкой «на {время}» (hooks/useShopLights).
*/

const ICON: Record<ShopLightColor, keyof typeof Feather.glyphMap> = { red: "alert-octagon", yellow: "alert-triangle", green: "check-circle" };

function tone(colors: ThemeColors, color: ShopLightColor): { fill: string; subtle: string } {
  if (color === "red") return { fill: colors.status.danger, subtle: colors.status.dangerDim };
  if (color === "yellow") return { fill: colors.status.warning, subtle: colors.status.warningDim };
  return { fill: colors.status.success, subtle: colors.status.successDim };
}

const money = (n: number) => formatMoney(n);

/** Точка у названия магазина в списке. Нет светофора (чужой магазин, нет ответа и копии) — ничего. */
export function ShopLightDot({ light }: { light: ShopLight | undefined }) {
  const colors = useThemeColors();
  const t = useT();
  const lang = useLang();
  if (!light) return null;
  const summary = light.reasons.length === 0
    ? t("Долг в норме, заказывает в своём ритме", "Qarz me'yorida, buyurtmalar odatdagi maromda")
    : light.reasons.map(r => lightReasonText(r, lang, money)).join("; ");
  const { fill, subtle } = tone(colors, light.color);
  return (
    <View
      testID={`shop-light-dot-${light.color}`}
      accessibilityRole="image"
      accessibilityLabel={`${lightColorLabel(light.color, lang)}. ${summary}`}
      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fill, borderWidth: 2, borderColor: subtle, flexShrink: 0 }}
    />
  );
}

function Figure({ label, value, sub, valueColor }: { label: string; value: ReactNode; sub?: string; valueColor?: string }) {
  const colors = useThemeColors();
  return (
    // Колодец на фоне холста: глубину даёт цвет, а не обводка — как в вебе.
    <View style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radii.lg, backgroundColor: colors.bg.primary }}>
      <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: colors.text.tertiary }}>{label}</Text>
      <Text numberOfLines={2} style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: valueColor ?? colors.text.primary, marginTop: 4 }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

/** Сводка светофора — крупный блок карточки магазина. savedAt — ответ не свежий, «на {время}». */
export function ShopLightCard({ light, savedAt }: { light: ShopLight; savedAt: string | null }) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const { fill, subtle } = tone(colors, light.color);
  const usedPct = light.creditLimit && light.creditLimit > 0 ? Math.floor((light.debt / light.creditLimit) * 100) : null;
  const last = light.lastNoOrder;
  const pause = light.reasons.some(r => r.code === "long_pause");

  const figures: ReactNode[] = [
    <Figure key="overdue"
      label={t("Из них просрочено", "Shundan muddati o'tgan")}
      value={money(light.overdue)}
      valueColor={light.overdue > 0 ? colors.status.danger : undefined}
      sub={light.overdue > 0
        ? t(`самый старый — ${light.oldestOverdueDays} дн.`, `eng eskisi — ${light.oldestOverdueDays} kun`)
        : t(`отсрочка ${light.graceDays} дн.`, `muhlat ${light.graceDays} kun`)} />,
    <Figure key="limit"
      label={t("Кредитный лимит", "Kredit limiti")}
      value={light.creditLimit == null ? t("без лимита", "limitsiz") : money(light.creditLimit)}
      sub={usedPct != null ? t(`занято ${usedPct}%`, `${usedPct}% band`) : undefined} />,
    <Figure key="avg"
      label={t(`Средний чек · ${SHOP_LIGHT_RULES.AVG_CHECK_DAYS} дн.`, `O'rtacha chek · ${SHOP_LIGHT_RULES.AVG_CHECK_DAYS} kun`)}
      value={light.avgCheck == null ? "—" : money(light.avgCheck)}
      sub={t(`заказов: ${light.avgCheckOrders}`, `buyurtmalar: ${light.avgCheckOrders}`)} />,
    <Figure key="since"
      label={t("С прошлого заказа", "Oxirgi buyurtmadan beri")}
      value={light.daysSinceOrder == null ? t("заказов нет", "buyurtma yo'q") : t(`${light.daysSinceOrder} дн.`, `${light.daysSinceOrder} kun`)}
      valueColor={pause ? colors.status.warning : undefined}
      sub={light.usualIntervalDays != null
        ? t(`обычно раз в ${light.usualIntervalDays} дн.`, `odatda har ${light.usualIntervalDays} kunda`)
        : t("ритм не ясен: мало заказов", "maromi noma'lum: buyurtma kam")} />,
    <Figure key="noorder"
      label={t("Последний визит без заказа", "Oxirgi buyurtmasiz tashrif")}
      value={last && isNoOrderReason(last.reason) ? noOrderReasonText(last.reason, last.note, lang) : "—"}
      sub={last ? last.date.slice(0, 10).split("-").reverse().join(".") : t("не было", "bo'lmagan")} />,
  ];
  const rows: ReactNode[][] = [];
  for (let i = 0; i < figures.length; i += 2) rows.push(figures.slice(i, i + 2));

  return (
    <View
      testID={`shop-light-${light.color}`}
      accessibilityLabel={t("Светофор магазина", "Do'kon svetofori")}
      style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xxl, padding: Spacing.lg, marginBottom: 16, ...soft(isDark).raised }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: subtle, alignItems: "center", justifyContent: "center" }}>
          <Feather name={ICON[light.color]} size={22} color={fill} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: colors.text.tertiary }}>
            {t("Можно ли грузить", "Yuklash mumkinmi")}
          </Text>
          <Text testID="shop-light-label" style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: fill, marginTop: 2 }}>
            {lightColorLabel(light.color, lang)}
          </Text>
          {savedAt && (
            <View testID="shop-light-stamp" style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Feather name="clock" size={11} color={colors.text.tertiary} />
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary }}>
                {t(`на ${lightStamp(savedAt)}`, `${lightStamp(savedAt)} holatiga`)}
              </Text>
            </View>
          )}
          <View style={{ marginTop: 8, gap: 4 }}>
            {light.reasons.length === 0 ? (
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>
                {t("Долг в норме, заказывает в своём ритме", "Qarz me'yorida, buyurtmalar odatdagi maromda")}
              </Text>
            ) : light.reasons.map((r, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: r.code === "overdue" || r.code === "over_limit" ? colors.status.danger : colors.status.warning }} />
                <Text style={{ flex: 1, fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.primary }}>
                  {lightReasonText(r, lang, money)}
                </Text>
              </View>
            ))}
          </View>
          {light.color === "red" && light.overdue > 0 && light.holdsOrders && (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 6 }}>
              {t("Новый заказ встанет на проверку офиса — включена «стоп отгрузки».", "Yangi buyurtma ofis tekshiruviga tushadi — «jo'natishni to'xtatish» yoqilgan.")}
            </Text>
          )}
        </View>
      </View>

      <View style={{ marginTop: Spacing.base, gap: 10 }}>
        {rows.map((pair, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            {pair}
            {pair.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Светофор с загрузкой — карточка магазина агента. Ни ответа, ни отложенной
 * копии — блока нет: ошибка на месте подсказки агенту ни к чему.
 */
export function ShopLightPanel({ shopId, enabled = true }: { shopId: number; enabled?: boolean }) {
  const entry = useShopLight(shopId, enabled);
  if (!entry) return null;
  return <ShopLightCard light={entry.light} savedAt={entry.savedAt} />;
}
