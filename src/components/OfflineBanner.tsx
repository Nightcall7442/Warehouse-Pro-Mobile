import { useEffect, useState } from "react";
import { View, Text, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { useOfflineStore } from "../store/offline";
import { Typography } from "../theme";
import { useThemeColors } from "../store/theme";

export function OfflineBanner() {
  const colors = useThemeColors();
  const [isOnline, setIsOnline] = useState(true);
  const [animVal] = useState(new Animated.Value(0));
  const { orders, deliveryActions } = useOfflineStore();
  const pendingCount = orders.filter(o => !o.synced).length + deliveryActions.filter(a => !a.synced).length;

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

  const height = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 36],
  });

  const bgColor = !isOnline ? colors.status.danger : colors.status.warning;
  const icon = !isOnline ? "wifi-off" : "refresh-cw";
  const text = !isOnline
    ? "Нет подключения к интернету"
    : `${pendingCount} ${pendingCount === 1 ? "заказ" : "заказов"} ожидают синхронизации`;

  if (isOnline && pendingCount === 0) return null;

  return (
    <Animated.View style={{ height, overflow: "hidden" }}>
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: bgColor,
        paddingVertical: 8,
        paddingHorizontal: 16,
      }}>
        <Feather name={icon as keyof typeof Feather.glyphMap} size={14} color="#fff" />
        <Text style={{
          fontFamily: Typography.fontSemibold,
          fontSize: Typography.size.xs,
          color: "#fff",
        }}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}
