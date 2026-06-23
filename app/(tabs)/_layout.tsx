import { Tabs } from "expo-router";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Gradients } from "../../src/theme";
import { useAuthStore } from "../../src/store/auth";

type IconName = keyof typeof Feather.glyphMap;

const TAB_ICONS: Record<string, IconName> = {
  index: "home", shops: "shopping-bag", orders: "clipboard", gps: "navigation", profile: "user",
  tracking: "map-pin", plans: "calendar",
};

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets  = useSafeAreaInsets();
  const colors  = useThemeColors();
  const { isDark } = useThemeStore();

  return (
    <View style={{ position:"absolute", left:16, right:16, bottom:0, alignItems:"center", paddingBottom: insets.bottom > 0 ? insets.bottom - 6 : 12 }}>
      <BlurView intensity={50} tint={isDark ? "dark" : "light"}
        style={{ flexDirection:"row", width:"100%", borderRadius:24, overflow:"hidden", borderWidth:1, borderColor:colors.tab.border, paddingHorizontal:6, paddingVertical:6, shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:isDark?0.35:0.12, shadowRadius:24, elevation:12 }}>
        <View style={{ ...Platform.select({ android:{ backgroundColor: isDark?"rgba(15,17,25,0.92)":"rgba(255,255,255,0.95)" } }), ...StyleSheet.absoluteFillObject }}/>
        {!Platform.OS || Platform.OS === "android" ? (
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? "rgba(15,17,25,0.92)" : "rgba(255,255,255,0.95)", borderRadius:24 }}/>
        ) : null}
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const iconName = TAB_ICONS[route.name] ?? "circle";
          const label = options.title ?? route.name;
          const onPress = () => {
            const event = navigation.emit({ type:"tabPress", target:route.key, canPreventDefault:true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity key={route.key} accessibilityRole="button" onPress={onPress} activeOpacity={0.7}
              style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
              {isFocused ? (
                <LinearGradient colors={Gradients.primary as any} start={{x:0,y:0}} end={{x:1,y:1}}
                  style={{ alignItems:"center", justifyContent:"center", gap:3, paddingVertical:9, width:"100%", borderRadius:18, borderWidth:1, borderColor:"rgba(129,140,248,0.35)" }}>
                  <Feather name={iconName} size={20} color="#fff"/>
                  <Text style={{ fontSize:11, fontFamily:Typography.fontSemiBold, color:"#fff", letterSpacing:0.2 }}>{label}</Text>
                </LinearGradient>
              ) : (
                <View style={{ alignItems:"center", justifyContent:"center", gap:3, paddingVertical:9, width:"100%", borderRadius:18 }}>
                  <Feather name={iconName} size={20} color={colors.tab.inactive}/>
                  <Text style={{ fontSize:11, fontFamily:Typography.fontMedium, color:colors.tab.inactive, letterSpacing:0.2 }}>{label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  const colors = useThemeColors();
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor";

  const screenOptions = {
    headerStyle: { backgroundColor: colors.bg.secondary },
    headerTintColor: colors.text.primary,
    headerTitleStyle: { fontFamily: Typography.fontBold, color: colors.text.primary },
    headerShadowVisible: false,
  };

  // Supervisor and agent share one app, but see different tabs — supervisors
  // manage agents (tracking + assigning visit plans) rather than placing
  // orders themselves, so the agent-only tabs (shops/orders/gps) are hidden
  // for them rather than duplicated into a separate app.
  //
  // Expo Router needs every possible screen to be registered up front —
  // `href: null` removes a screen from the tab bar without unmounting the
  // route, which is what actually hides it for the "wrong" role here.
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: "Главная", headerShown: false, href: isSupervisor ? null : undefined }} />

      <Tabs.Screen
        name="shops"
        options={{ title: "Магазины", headerShown: false, href: isSupervisor ? null : undefined }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "Заказы", href: isSupervisor ? null : undefined }}
      />
      <Tabs.Screen
        name="gps"
        options={{ title: "GPS", href: isSupervisor ? null : undefined }}
      />

      <Tabs.Screen
        name="tracking"
        options={{ title: "Трекинг", headerShown: false, href: isSupervisor ? undefined : null }}
      />
      <Tabs.Screen
        name="plans"
        options={{ title: "Планы", headerShown: false, href: isSupervisor ? undefined : null }}
      />

      <Tabs.Screen name="profile" options={{ title: "Профиль", headerShown: false }} />
    </Tabs>
  );
}
