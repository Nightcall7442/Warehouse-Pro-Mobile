import { useEffect, useState } from "react";
import { View, Text, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineStore } from "../store/offline";
import { useVisitQueue } from "../store/visit-queue";
import { Typography } from "../theme";
import { useThemeColors } from "../store/theme";
import { plural } from "../lib/plural";
import { readableInk } from "../lib/contrast";
import { useT } from "../i18n";

const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const colors = useThemeColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(true);
  const [animVal] = useState(new Animated.Value(0));
  const { orders, deliveryActions } = useOfflineStore();

  // Очереди считаются раздельно. Раньше они складывались в одно число, а
  // подпись всегда говорила «заказ/заказов» — и курьер, отметивший две доставки
  // без связи, читал наверху «2 заказов ожидают синхронизации». Заказов он не
  // создаёт вовсе: он искал их и не понимал, ушли его отметки или нет.
  const pendingOrders = orders.filter(o => !o.synced).length;
  const pendingActions = deliveryActions.filter(a => !a.synced).length;
  // Третья очередь — визиты; отвергнутые сервером не «ожидают», они показаны на плане.
  const pendingVisits = useVisitQueue(s => s.actions.filter(a => !a.synced && a.retryable !== false).length);
  const pendingCount = pendingOrders + pendingActions + pendingVisits;

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: !isOnline || pendingCount > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOnline, pendingCount, animVal]);

  // Полоса — первый элемент корневой раскладки, а с Expo 54 содержимое на
  // Android по умолчанию рисуется под системной строкой. Без верхнего отступа
  // единственная надпись, объясняющая человеку, почему экраны пустые, наполовину
  // закрыта часами и значком батареи. Все прочие шапки приложения отступ берут.
  const height = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT + insets.top],
  });

  const bgColor = !isOnline ? colors.status.danger : colors.status.warning;
  // Чернила подбираются по яркости заливки. Белым литералом было прописано и
  // на жёлтой полосе «ожидают отправки»: единственная надпись, объясняющая
  // человеку происходящее, тонула в собственном фоне.
  const ink = readableInk(bgColor);
  const icon = !isOnline ? "wifi-off" : "refresh-cw";

  // «Отправка», а не «синхронизация»: тем же словом названа эта очередь на
  // экране заказов, и человеку незачем догадываться, что это одно и то же.
  // Глагол согласуется с общим числом: при одной записи выходило «1 заказ
  // ожидают синхронизации».
  // По-узбекски число не склоняет слово: «3 ta buyurtma» — одна форма на всё.
  const parts = [
    pendingOrders > 0 ? t(`${pendingOrders} ${plural(pendingOrders, "заказ", "заказа", "заказов")}`, `${pendingOrders} ta buyurtma`) : null,
    pendingActions > 0 ? t(`${pendingActions} ${plural(pendingActions, "отметка", "отметки", "отметок")} доставки`, `${pendingActions} ta yetkazish belgisi`) : null,
    pendingVisits > 0 ? t(`${pendingVisits} ${plural(pendingVisits, "визит", "визита", "визитов")}`, `${pendingVisits} ta tashrif`) : null,
  ].filter((x): x is string => Boolean(x));
  const and = t(" и ", " va ");
  const queued = parts.length > 1 ? parts.slice(0, -1).join(", ") + and + parts[parts.length - 1] : (parts[0] ?? "");

  const text = !isOnline
    ? t("Нет подключения к интернету", "Internet aloqasi yo'q")
    : t(`${queued} ${plural(pendingCount, "ожидает", "ожидают", "ожидают")} отправки`, `${queued} yuborishni kutmoqda`);

  if (isOnline && pendingCount === 0) return null;

  return (
    <Animated.View style={{ height, overflow: "hidden" }}>
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: bgColor,
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        paddingHorizontal: 16,
      }}>
        <Feather name={icon as keyof typeof Feather.glyphMap} size={14} color={ink} />
        <Text style={{
          fontFamily: Typography.fontSemibold,
          fontSize: Typography.size.xs,
          color: ink,
        }}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}
