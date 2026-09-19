// Warehouse Pro — панель вкладок: ровная, прижата к краю, без объёма.
import { useMemo } from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, TAB_BAR_HEIGHT } from "../../src/theme";
import { useAuthStore } from "../../src/store/auth";
import { isTabVisible } from "../../src/lib/tabs";
import { useT } from "../../src/i18n";

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
  debtors: "alert-circle",
};

// Подписи — функцией от t: язык выбирают на телефоне, а не при сборке.
const tabLabels = (t: (ru: string, uz: string) => string): Record<string, string> => ({
  index: t("Главная", "Bosh sahifa"),
  shops: t("Магазины", "Do'konlar"),
  catalog: t("Каталог", "Katalog"),
  orders: t("Заказы", "Buyurtmalar"),
  plan: t("План", "Reja"),
  plans: t("Планы", "Rejalar"),
  targets: t("Нормы", "Normalar"),
  deliveries: t("Доставки", "Yetkazish"),
  profile: t("Профиль", "Profil"),
  tracking: t("Слежение", "Kuzatuv"),
  debtors: t("Долги", "Qarzlar"),
});

function CustomTabBar(props: BottomTabBarProps) {
  const t = useT();
  const TAB_LABELS = tabLabels(t);
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  // Агент: Главная, Магазины, Каталог, Заказы, Профиль
  // Надзор:  Главная, Карта, Планы, Магазины («Нормы» — из «Планов»)
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

  /*
    Панель — ровная и прижата к краю, как у системных приложений: белая
    плоскость на холсте, тонкая линия сверху, иконки 22 и подписи 11.
    Плавающая «таблетка» с двойными тенями, приподнятой активной вкладкой и
    градиентной гранью читалась как чужой продукт — дёшево. Активная вкладка —
    иконка на мягкой подушке цвета бренда и подпись чернилами; остальное —
    без объёма (принцип «поверхности без объёма», см. brief §1.4).
  */
  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: colors.bg.card,
      borderTopWidth: 1, borderTopColor: colors.border.subtle,
      paddingBottom: insets.bottom, paddingTop: 6, paddingHorizontal: Spacing.xs,
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
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", minHeight: TAB_BAR_HEIGHT - 6, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{
              width: 52, height: 30, borderRadius: Radii.full, alignItems: "center", justifyContent: "center",
              backgroundColor: isFocused ? colors.brand.primaryDim : "transparent",
            }}>
              <Feather name={iconName} size={22} color={isFocused ? colors.tab.active : colors.tab.inactive} />
            </View>
            <Text
              maxFontSizeMultiplier={1.2}
              style={{
                fontSize: 11,
                lineHeight: 14,
                fontFamily: isFocused ? Typography.fontSemibold : Typography.fontMedium,
                color: isFocused ? colors.text.primary : colors.tab.inactive,
                marginTop: 3,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useThemeColors();
  const t = useT();
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
        options={{ title: t("Главная", "Bosh sahifa"), headerShown: false }}
      />
      <Tabs.Screen name="tracking" options={{ title: t("Карта", "Xarita"), headerShown: false }} />
      <Tabs.Screen
        name="shops"
        options={{ title: t("Магазины", "Do'konlar"), headerShown: false }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: t("Каталог", "Katalog"), headerShown: false }}
      />
      <Tabs.Screen name="orders" options={{ title: t("Заказы", "Buyurtmalar"), headerShown: false }} />
      <Tabs.Screen
        name="plan"
        options={{ title: t("План", "Reja"), headerShown: false }}
      />
      <Tabs.Screen
        name="plans"
        options={{ title: t("Планы", "Rejalar"), headerShown: false }}
      />
      <Tabs.Screen
        name="targets"
        options={{ title: t("Нормы", "Normalar"), headerShown: false }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{ title: t("Доставки", "Yetkazish"), headerShown: false }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t("Профиль", "Profil"), headerShown: false }}
      />
      <Tabs.Screen
        name="debtors"
        options={{ title: t("Долги", "Qarzlar"), headerShown: false }}
      />
      {/* Скрытые экраны рисуют свою шапку — навигатор свою не показывает: иначе на iOS две шапки, а у gps в ней имя маршрута. */}
      <Tabs.Screen name="gps" options={{ title: t("Геолокация", "Geolokatsiya"), tabBarButton: () => null, headerShown: false }} />
      <Tabs.Screen name="barcode" options={{ title: t("Сканер", "Skaner"), tabBarButton: () => null, headerShown: false }} />
    </Tabs>
  );
}
