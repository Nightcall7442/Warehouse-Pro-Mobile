// Warehouse Pro — Tabs Layout v2 (cold palette, no DarkShadowColor)
import { useMemo } from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft, raisedFaces } from "../../src/theme";
import { useAuthStore } from "../../src/store/auth";
import { isTabVisible } from "../../src/lib/tabs";

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
  const { isDark } = useThemeStore();
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  // Агент: Главная, Магазины, Каталог, Заказы, Профиль
  // Надзор:  Главная, Магазины, Планы, Нормы, Карта
  //
  // Правило вынесено в src/lib/tabs.ts и проверяется тестом: его ошибка не
  // выглядит поломкой — экран остаётся в приложении, просто до него нечем
  // дойти. Так «Слежение» с картой агентов и пропало у супервайзеров.
  const visibleRoutes = state.routes.filter((route: { name: string }) => isTabVisible(route.name, user?.role));

  /*
    На сканере панели быть не должно.

    Она рисуется один раз на весь навигатор и стоит поверх содержимого,
    занимая от нижнего края около 70 точек. Нижняя плашка сканера отбита от
    края на 32 — то есть кнопка «Заказать этот товар» лежала под панелью
    целиком. Агент наводил камеру, товар находился, а нажатие уходило в
    «Каталог» или «Заказы»: экран менялся, заказ не создавался.

    Прячем только здесь. У остальных скрытых экранов своей кнопки возврата
    нет (у «Доставок», например, только заголовок), и убрав панель там, мы
    оставили бы курьера вообще без видимой навигации. У сканера свой
    «назад» есть.
  */
  if (state.routes[state.index]?.name === "barcode") return null;

  return (
    <View style={{ position: "absolute", left: Spacing.base, right: Spacing.base, bottom: insets.bottom > 0 ? insets.bottom + 8 : 20, alignItems: "center" }}>
      {/*
        Плашка цвета холста: в мягком неоморфизме она не светлее фона и не
        полупрозрачна — от фона её отделяет только пара теней. Прозрачность
        здесь была из другого языка оформления и вместе с рамкой давала
        «стекло», которого в референсе нет.

        overflow не скрывается: тень рисуется ЗА границей плашки, и обрезка
        съела бы весь объём.
      */}
      <View style={{
        flexDirection: "row", width: "100%", borderRadius: Radii["2xl"],
        paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs,
        backgroundColor: colors.bg.primary,
        ...soft(isDark).raisedLg,
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
                overflow: "hidden",
                // Активная вкладка приподнята, а не залита цветом: объём
                // читается и там, где цветное пятно теряется — на солнце и у
                // тех, кто различает оттенки хуже.
                ...(isFocused ? soft(isDark).raisedSm : null),
              }}
            >
              {/* Грань выдавленной поверхности: светлее сверху-слева, темнее
                  снизу-справа. Без неё вкладка выглядит наклейкой. */}
              {isFocused && (
                <LinearGradient
                  colors={raisedFaces(isDark)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  pointerEvents="none"
                />
              )}
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
      <Tabs.Screen name="tracking" options={{ title: "Карта", headerShown: false }} />
      <Tabs.Screen name="barcode" options={{ tabBarButton: () => null }} />
    </Tabs>
  );
}
