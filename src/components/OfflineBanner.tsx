import { useEffect, useState } from "react";
import { View, Text, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineStore } from "../store/offline";
import { Typography } from "../theme";
import { useThemeColors } from "../store/theme";
import { plural } from "../lib/plural";
import { readableInk } from "../lib/contrast";

const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const colors = useThemeColors();
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
  const pendingCount = pendingOrders + pendingActions;

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
  const queued = [
    pendingOrders > 0 ? `${pendingOrders} ${plural(pendingOrders, "заказ", "заказа", "заказов")}` : null,
    pendingActions > 0 ? `${pendingActions} ${plural(pendingActions, "отметка", "отметки", "отметок")} доставки` : null,
  ].filter(Boolean).join(" и ");

  const text = !isOnline
    ? "Нет подключения к интернету"
    : `${queued} ${plural(pendingCount, "ожидает", "ожидают", "ожидают")} отправки`;

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
