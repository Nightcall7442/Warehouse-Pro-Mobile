// Warehouse Pro — Tabs Layout v2 (cold palette, no DarkShadowColor)
import { useMemo } from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii } from "../../src/theme";
import { useAuthStore } from "../../src/store/auth";

type IconName = keyof typeof Feather.glyphMap;

const TAB_ICONS: Record<string, IconName> = {
  index: "home",
  shops: "shopping-bag",
  catalog: "grid",
  orders: "clipboard",
  plan: "target",
  plans: "calendar",
  targets: "trending-up",
  deliveries: "truck",
  profile: "user",
  tracking: "map",
};

const TAB_LABELS: Record<string, string> = {
  index: "Главная",
  shops: "Магазины",
  catalog: "Каталог",
  orders: "Заказы",
  plan: "План",
  plans: "Планы",
  targets: "Нормы",
  deliveries: "Доставки",
  profile: "Профиль",
  tracking: "Слежение",
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

  const ALWAYS_HIDDEN = ["gps", "barcode"]; // service screens, not tabs
  const COURIER_HIDDEN = ["shops", "catalog", "orders"];
  const MERCH_HIDDEN = ["orders", "catalog"];

  const visibleRoutes = state.routes.filter((route: { name: string }) => {
    if (ALWAYS_HIDDEN.includes(route.name)) return false;
    if (isCourier && COURIER_HIDDEN.includes(route.name)) return false;
    if (isMerchandiser && MERCH_HIDDEN.includes(route.name)) return false;
    if (!isCourier && route.name === "deliveries") return false;
    // "plans" — visit plans (supervisor: SupervisorPlansView, agent: AgentPlansView)
    if (route.name === "plans") return !isCourier;
    // "plan" — agent/merchandiser monthly norms + KPI (not for supervisor)
    if (route.name === "plan") return !isSupervisor && !isCourier;
    // "targets" — supervisor quotas tracking
    if (route.name === "targets") return isSupervisor;
    // "orders" — hide for supervisors (they use dashboard activity)
    if (route.name === "orders") return !isSupervisor;
    // "profile" — agent and merchandiser only (supervisor has settings elsewhere)
    if (route.name === "profile") return !isSupervisor && !isCourier;
    // "tracking" — supervisor only (map with all agent locations)
    if (route.name === "tracking") return isSupervisor;
    return true;
  });

  return (
    <View style={{ position: "absolute", left: Spacing.base, right: Spacing.base, bottom: insets.bottom > 0 ? insets.bottom + 8 : 20, alignItems: "center" }}>
      <View style={{
        flexDirection: "row", width: "100%", borderRadius: Radii.xxl, overflow: "hidden",
        borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)",
        paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs,
        backgroundColor: isDark ? "rgba(34,31,28,0.95)" : "rgba(239,237,234,0.95)",
        shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.4 : 0.38, shadowRadius: 24, elevation: 16,
      }}>
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
                  fontFamily: isFocused ? Typography.fontSemibold : Typography.fontMedium,
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
        name="plan"
        options={{ title: "План", headerShown: false }}
      />
      <Tabs.Screen
        name="plans"
        options={{ title: "Планы", headerShown: false }}
      />
      <Tabs.Screen
        name="targets"
        options={{ title: "Нормы", headerShown: false }}
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
