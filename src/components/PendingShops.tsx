import { View, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Card, Button, Badge } from "./ui";
import { Typography, Spacing } from "../theme";
import { useThemeColors } from "../store/theme";
import { useT } from "../i18n";
import { plural } from "../lib/plural";
import { useOfflineStore } from "../store/offline";
import { useShopQueue, useMyPendingShops, isRejectedShop, type PendingShop } from "../store/shop-queue";

/**
 * Магазины, заведённые без связи, — наверху вкладки «Магазины», пока не ушли.
 *
 * Открыть карточку нельзя: номера на сервере у магазина ещё нет. Заказ
 * оформить можно сразу. Отвергнутый сервером показывает причину и
 * «Повторить» / «Убрать» — как визит на плане.
 */
export function PendingShops() {
  const shops = useMyPendingShops();
  if (shops.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm }}>
      {shops.map(s => <PendingShopCard key={s.localId} shop={s} />)}
    </View>
  );
}

function PendingShopCard({ shop }: { shop: PendingShop }) {
  const t = useT();
  const colors = useThemeColors();
  const router = useRouter();
  const qc = useQueryClient();
  const retry = useShopQueue(s => s.retry);
  const remove = useShopQueue(s => s.remove);
  const waiting = useOfflineStore(s => s.orders.filter(o => !o.synced && o.input.shopId === shop.localId).length);
  const rejected = isRejectedShop(shop);
  const name = shop.input.name;

  const confirmRemove = () => {
    const what = waiting > 0
      ? t(`«${name}» и ${waiting} ${plural(waiting, "заказ", "заказа", "заказов")} на него не будут отправлены.`, `«${name}» va unga ${waiting} ta buyurtma yuborilmaydi.`)
      : t(`«${name}» не будет отправлен.`, `«${name}» yuborilmaydi.`);
    Alert.alert(
      t("Убрать магазин?", "Do'konni olib tashlaysizmi?"),
      t(`${what} Отменить нельзя.`, `${what} Qaytarib bo'lmaydi.`),
      [
        { text: t("Отмена", "Bekor"), style: "cancel" },
        { text: t("Убрать", "Olib tashlash"), style: "destructive", onPress: () => { void remove(shop.localId); } },
      ],
    );
  };

  const onRetry = async () => {
    await retry(shop.localId);
    qc.invalidateQueries({ queryKey: ["shops"] });
    qc.invalidateQueries({ queryKey: ["availableShops"] });
    qc.invalidateQueries({ queryKey: ["myOrders"] });
  };

  return (
    <Card style={{ padding: Spacing.md, gap: Spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
        <Feather name={rejected ? "alert-circle" : "upload-cloud"} size={18} color={rejected ? colors.status.danger : colors.status.warning} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{name}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }} numberOfLines={1}>
            {[shop.input.ownerName, shop.input.city, shop.input.address].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
      </View>
      {rejected ? (
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.status.danger }} numberOfLines={3}>
          {t("Сервер не принял магазин: ", "Server do'konni qabul qilmadi: ")}{shop.error}
        </Text>
      ) : (
        <Badge variant="warning">{t("Новый · ждёт отправки", "Yangi · yuborishni kutmoqda")}</Badge>
      )}
      {waiting > 0 && (
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary }}>
          {t(`${waiting} ${plural(waiting, "заказ ждёт", "заказа ждут", "заказов ждут")} его отправки`, `${waiting} ta buyurtma uning yuborilishini kutmoqda`)}
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" }}>
        {rejected ? (
          <>
            <Button size="sm" variant="secondary" icon="refresh-cw" onPress={() => { void onRetry(); }}>{t("Повторить", "Qayta")}</Button>
            <Button size="sm" variant="secondary" icon="x" onPress={confirmRemove}>{t("Убрать", "Olib tashlash")}</Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" icon="plus"
            onPress={() => router.push({ pathname: "/order/new", params: { shopId: String(shop.localId), shopName: name } })}>
            {t("Заказ", "Buyurtma")}
          </Button>
        )}
      </View>
    </Card>
  );
}
