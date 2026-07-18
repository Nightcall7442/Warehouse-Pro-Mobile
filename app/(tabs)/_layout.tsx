import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, Shadows } from "../../src/theme";
import { useAuthStore } from "../../src/store/auth";
import { DarkShadowColor } from "../../src/theme";

type IconName = keyof typeof Feather.glyphMap;

const TAB_ICONS: Record<string, IconName> = {
  index: "home",
  shops: "shopping-bag",
  catalog: "grid",
  orders: "clipboard",
  profile: "user",
  plans: "calendar",
  deliveries: "truck",
};

const TAB_LABELS: Record<string, string> = {
  index: "Главная",
  shops: "Магазины",
  catalog: "Каталог",
  orders: "Заказы",
  profile: "Профиль",
  plans: "Планы",
  deliveries: "Доставки",
};

function CustomTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isCourier = user?.role === "courier";
  const isMerchandiser = user?.role === "merchandiser";

  const HIDDEN = ["tracking", "gps", "barcode"];
  const AGENT_ONLY = ["orders"];
  const COURIER_HIDDEN = ["shops", "catalog", "orders"];
  const MERCH_HIDDEN = ["orders", "plans"];

  const visibleRoutes = state.routes.filter((route: { name: string }) => {
    if (HIDDEN.includes(route.name)) return false;
    if (isCourier && COURIER_HIDDEN.includes(route.name)) return false;
    if (isMerchandiser && MERCH_HIDDEN.includes(route.name)) return false;
    if (isSupervisor && AGENT_ONLY.includes(route.name)) return false;
    if (!isSupervisor && !isCourier && !isMerchandiser && route.name === "plans") return false;
    if (!isCourier && route.name === "deliveries") return false;
    if (isCourier && route.name === "plans") return false;
    return true;
  });

  const shadowColor = isDark ? DarkShadowColor : "#000";

  return (
    <View
      style={{
        position: "absolute",
        left: Spacing.base,
        right: Spacing.base,
        bottom: insets.bottom > 0 ? insets.bottom + 8 : 20,
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          borderRadius: Radii.xxl,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)",
          paddingHorizontal: Spacing.xs,
          paddingVertical: Spacing.xs,
          backgroundColor: isDark ? "rgba(34,31,28,0.95)" : "rgba(239,237,234,0.95)",
          shadowColor,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.4 : 0.38,
          shadowRadius: 24,
          elevation: 16,
        }}
      >
        {visibleRoutes.map((route: { name: string; key: string }) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === state.routes.indexOf(route);
          const iconName = TAB_ICONS[route.name] ?? "circle";
          const label = TAB_LABELS[route.name] ?? options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented)
              navigation.navigate(route.name);
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                borderRadius: Radii.lg,
                backgroundColor: isFocused
                  ? (isDark ? "rgba(0,212,255,0.12)" : "rgba(91,109,138,0.10)")
                  : "transparent",
              }}
            >
              <Feather
                name={iconName}
                size={18}
                color={isFocused ? colors.tab.active : colors.tab.inactive}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: isFocused ? Typography.fontSemiBold : Typography.fontMedium,
                  color: isFocused ? colors.tab.active : colors.tab.inactive,
                  marginTop: 3,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

import { useMemo } from "react";

export default function TabsLayout() {
  const colors = useThemeColors();
  const { user } = useAuthStore();
  void user;

  const screenOptions = useMemo(() => ({
    headerStyle: { backgroundColor: colors.bg.secondary },
    headerTintColor: colors.text.primary,
    headerTitleStyle: {
      fontFamily: Typography.fontBold,
      color: colors.text.primary,
    },
    headerShadowVisible: false,
  }), [colors.bg.secondary, colors.text.primary]);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={screenOptions}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Главная", headerShown: false }}
      />
      <Tabs.Screen
        name="shops"
        options={{ title: "Магазины", headerShown: false }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: "Каталог", headerShown: false }}
      />
      <Tabs.Screen name="orders" options={{ title: "Заказы" }} />
      <Tabs.Screen
        name="plans"
        options={{ title: "Планы", headerShown: false }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{ title: "Доставки", headerShown: false }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Профиль", headerShown: false }}
      />
      <Tabs.Screen name="gps" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="tracking" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="barcode" options={{ tabBarButton: () => null }} />
    </Tabs>
  );
}
