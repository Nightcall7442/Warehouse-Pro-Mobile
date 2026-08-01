import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
} from "../../theme";
import { Card, IconCircle } from "../ui";
import { FadeInItem } from "../Animated";
import { money, makeStyles } from "./OrderStyles";

const UNIT_LABELS: Record<string, string> = {
  kg: "кг", l: "л", pcs: "шт", box: "блок", pack: "упак", m: "м", block: "блок",
};

/** Single product line in the order */
function ItemRow({ name, code, qty, price, discount, total, colors, unit, deliveredQty, returnReason }: {
  name: string; code?: string; qty: number; price: number; discount?: number; total: number; colors: ThemeColors;
  unit?: string; deliveredQty?: number | null; returnReason?: string | null;
}) {
  const styles = makeStyles(colors);
  const unitLabel = UNIT_LABELS[unit ?? "pcs"] ?? "шт";
  const hasPartial = deliveredQty != null && deliveredQty < qty;
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName} numberOfLines={2}>{name}</Text>
        {code && <Text style={styles.itemCode}>{code}</Text>}
        <View style={styles.itemMeta}>
          {hasPartial ? (
            <View>
              <Text style={[styles.itemQty, { textDecorationLine: "line-through", color: colors.text.muted }]}>{qty} {unitLabel}</Text>
              <Text style={[styles.itemQty, { color: colors.status.warning, fontFamily: Typography.fontBold }]}>Отдано: {deliveredQty} {unitLabel}</Text>
              {returnReason && <Text style={[styles.itemCode, { color: colors.status.danger, marginTop: 2 }]}>{returnReason}</Text>}
            </View>
          ) : (
            <Text style={styles.itemQty}>{qty} {unitLabel}</Text>
          )}
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
        <Text style={styles.itemPrice}>{money(price)} / {unitLabel}</Text>
      </View>
    </View>
  );
}

/** Items list card */
export function OrderItemsList({ order, colors }: { order: any; colors: ThemeColors }) {
  return (
    <FadeInItem delay={40}>
      {order.items && order.items.length > 0 ? (
        <Card style={{ marginBottom: Spacing.sm, padding: 0, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: Spacing.base, paddingBottom: 12 }}>
            <IconCircle name="package" size={15} variant="brand" />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Товары ({order.items.length})</Text>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />
          {order.items.map((item: any, idx: number) => (
            <View key={item.id ?? idx}>
              <ItemRow
                name={item.productName}
                code={item.productCode}
                qty={item.quantity}
                price={Number(item.unitPrice) || 0}
                discount={item.discount}
                total={Number(item.subtotal) || 0}
                colors={colors}
                unit={item.unit}
                deliveredQty={item.deliveredQuantity}
                returnReason={item.returnReason}
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
  );
}

/** Financial summary card */
export function OrderFinancialSummary({ order, subtotal, discount, colors }: {
  order: any; subtotal: number; discount: number; colors: ThemeColors;
}) {
  return (
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
  );
}
