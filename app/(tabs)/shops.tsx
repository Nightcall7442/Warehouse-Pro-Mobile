import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TextInput,
  Image,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { getMyShops, getAllShopsForSupervisor, Shop } from "../../src/api";
import { usePerformanceMonitor } from "../../src/hooks/usePerformanceMonitor";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { useLocation, getDistanceKm, getEstimatedTime } from "../../src/hooks/useLocation";
import * as Haptics from "expo-haptics";
import {
  Typography,
  Radii,
  Gradients,
  ThemeColors,
} from "../../src/theme";
import {
  ScreenHeader,
} from "../../src/components/ui";
import {
  FadeInItem,
  PressableScale,
  ShimmerSkeleton,
} from "../../src/components/Animated";

interface ShopWithDistance extends Shop {
  _distance: number;
  _estimatedTime: string;
}

// ── Shop card — clean minimal style ──────────────────────────────────────────
const ShopCard = React.memo(function ShopCard({
  shop,
  onOrder,
  onView,
  colors,
  isDark,
  index,
  distance,
  estimatedTime,
}: {
  shop: Shop;
  onOrder: () => void;
  onView: () => void;
  colors: ThemeColors;
  isDark: boolean;
  index: number;
  distance?: number;
  estimatedTime?: string;
}) {
  const hasDebt = Number(shop.debt ?? 0) > 0;
  const isActive = shop.status !== "inactive";

  return (
    <FadeInItem delay={index * 40} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <PressableScale onPress={onView} haptic="light" scaleTo={0.98}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: isDark ? "#1c1e2a" : "#ffffff",
            borderRadius: 16,
            overflow: "hidden",
            padding: 12,
            gap: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.06,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          {/* Photo */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: isDark ? "#2a2d3e" : "#f0f0f5",
            }}
          >
            {shop.photoUrl ? (
              <Image
                source={{ uri: shop.photoUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={24} color={colors.accent.primary} />
              </View>
            )}
            {/* Status dot */}
            <View style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isActive ? "#34d399" : "#9ca3af",
              borderWidth: 1.5,
              borderColor: isDark ? "#1c1e2a" : "#fff",
            }} />
          </View>

          {/* Info */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  fontFamily: Typography.fontBold,
                  fontSize: 15,
                  color: colors.text.primary,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {shop.name}
              </Text>
              {hasDebt && (
                <Text style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: 11,
                  color: "#ef4444",
                  backgroundColor: "rgba(239,68,68,0.1)",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 8,
                }}>
                  {Number(shop.debt).toLocaleString("ru")}
                </Text>
              )}
            </View>

            {shop.ownerName && (
              <Text style={{
                fontFamily: Typography.fontRegular,
                fontSize: 13,
                color: colors.text.secondary,
                marginTop: 2,
              }} numberOfLines={1}>
                {shop.ownerName}
              </Text>
            )}

            {(shop.district || shop.address) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Feather name="map-pin" size={11} color={colors.text.muted} />
                <Text style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: 12,
                  color: colors.text.muted,
                  flex: 1,
                }} numberOfLines={1}>
                  {[shop.city, shop.district, shop.address].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}

            {distance !== undefined && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: distance < 1 ? "rgba(16,185,129,0.1)" : distance < 3 ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 12,
                }}>
                  <Feather name="navigation" size={10} color={distance < 1 ? "#10b981" : distance < 3 ? "#f59e0b" : "#6b7280"} />
                  <Text style={{
                    fontFamily: Typography.fontMedium,
                    fontSize: 11,
                    color: distance < 1 ? "#10b981" : distance < 3 ? "#f59e0b" : "#6b7280",
                  }}>
                    {distance < 1 ? `${Math.round(distance * 1000)} м` : `${distance.toFixed(1)} км`}
                  </Text>
                </View>
                {estimatedTime && (
                  <Text style={{
                    fontFamily: Typography.fontRegular,
                    fontSize: 11,
                    color: colors.text.muted,
                  }}>
                    ~{estimatedTime}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Order button */}
          <View style={{ justifyContent: "center" }}>
            <PressableScale onPress={onOrder} haptic="medium" scaleTo={0.95}>
              <View style={{
                backgroundColor: colors.accent.primary,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
              }}>
                <Feather name="shopping-cart" size={16} color="#fff" />
              </View>
            </PressableScale>
          </View>
        </View>
      </PressableScale>
    </FadeInItem>
  );
});

export default function ShopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const perf = usePerformanceMonitor("ShopsScreen");
  const [search, setSearch] = useState("");
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const { location } = useLocation();

  const {
    data: shops,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["shops"],
    queryFn: isSupervisor ? getAllShopsForSupervisor : getMyShops,
    staleTime: 5 * 60 * 1000,
  });

  // Unique territories for filter chips
  const territories = useMemo(() => {
    const set = new Set<string>();
    (shops ?? []).forEach((s) => {
      const city = s.city || "";
      const district = s.district || "";
      const territory = district ? `${city} — ${district}` : city;
      if (territory) set.add(territory);
    });
    return Array.from(set).sort();
  }, [shops]);

  const filtered = useMemo(() => {
    perf.start("filterShops");
    let result: ShopWithDistance[] = (shops ?? []).filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.ownerName?.toLowerCase().includes(search.toLowerCase()) ||
        s.district?.toLowerCase().includes(search.toLowerCase());
      // Filter by territory (city — district)
      const city = s.city || "";
      const district = s.district || "";
      const territory = district ? `${city} — ${district}` : city;
      const matchesTerritory = !activeCity || territory === activeCity;
      return matchesSearch && matchesTerritory;
    }).map((s) => ({ ...s, _distance: Infinity, _estimatedTime: "" }));

    // Add distance info and sort by distance if enabled
    if (sortByDistance && location) {
      result = result
        .map((s) => {
          const lat = Number(s.gpsLat);
          const lng = Number(s.gpsLng);
          if (!lat || !lng) return { ...s, _distance: Infinity, _estimatedTime: "" };
          const distance = getDistanceKm(location.latitude, location.longitude, lat, lng);
          return { ...s, _distance: distance, _estimatedTime: getEstimatedTime(distance) };
        })
        .sort((a, b) => a._distance - b._distance);
    }

    perf.end("filterShops");
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, search, activeCity, sortByDistance, location]);

  const sections = useMemo(() => {
    // When sorting by distance, flatten into a single section
    if (sortByDistance && location) {
      return [{
        key: "distance",
        label: "По расстоянию",
        data: filtered,
      }];
    }

    // Group by territory: "City — District" (e.g., "Ташкент — Юнусабад")
    const map = new Map<string, ShopWithDistance[]>();
    for (const s of filtered) {
      const city = s.city || "Неизвестный город";
      const district = s.district || "";
      const key = district ? `${city} — ${district}` : city;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a.startsWith("Неизвестный")) return 1;
        if (b.startsWith("Неизвестный")) return -1;
        return a.localeCompare(b, "ru");
      })
      .map(([territory, data]) => ({
        key: territory,
        label: `${territory} (${data.length})`,
        data,
      }));
  }, [filtered, sortByDistance, location]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Магазины"
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {location && (
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync();
                  setSortByDistance(!sortByDistance);
                }}
                haptic="light"
              >
                <LinearGradient
                  colors={sortByDistance ? Gradients.success : Gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={sortByDistance ? "check" : "navigation"} size={18} color="#fff" />
                </LinearGradient>
              </PressableScale>
            )}
            <PressableScale
              onPress={() => router.push("/shop/nearby")}
              haptic="light"
            >
              <LinearGradient
                colors={Gradients.success}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="navigation" size={18} color="#fff" />
              </LinearGradient>
            </PressableScale>
            <PressableScale
              onPress={() => router.push("/shop/new")}
              haptic="light"
            >
              <LinearGradient
                colors={Gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="plus" size={20} color="#fff" />
              </LinearGradient>
            </PressableScale>
          </View>
        }
      />

      {/* Search with glass background */}
      <FadeInItem delay={80}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: isDark
                ? "rgba(26,29,38,0.8)"
                : "rgba(240,242,247,0.9)",
              borderRadius: Radii.md,
              borderWidth: 1,
              borderColor: colors.border.default,
              paddingHorizontal: 10,
              gap: 8,
            }}
          >
            <Feather name="search" size={16} color={colors.text.tertiary} />
            <TextInput
              style={{
                flex: 1,
                fontFamily: Typography.fontRegular,
                fontSize: Typography.size.base,
                color: colors.text.primary,
                paddingVertical: 10,
              }}
              placeholder="Поиск магазинов или района…"
              placeholderTextColor={colors.text.tertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <PressableScale onPress={() => setSearch("")} haptic="selection">
                <Feather name="x" size={15} color={colors.text.tertiary} />
              </PressableScale>
            )}
          </View>

          {/* Territory filter chips */}
          {territories.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10 }}
              contentContainerStyle={{ gap: 8 }}
            >
              <PressableScale
                onPress={() => setActiveCity(null)}
                haptic="selection"
              >
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: Radii.full,
                    backgroundColor: !activeCity
                      ? colors.accent.primary
                      : colors.bg.input,
                    borderWidth: 1,
                    borderColor: !activeCity
                      ? colors.accent.primary
                      : colors.border.default,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: Typography.fontSemibold,
                      fontSize: Typography.size.sm,
                      color: !activeCity ? "#fff" : colors.text.secondary,
                    }}
                  >
                    Все территории
                  </Text>
                </View>
              </PressableScale>
              {territories.map((territory) => (
                <PressableScale
                  key={territory}
                  onPress={() =>
                    setActiveCity((c) => (c === territory ? null : territory))
                  }
                  haptic="selection"
                >
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: Radii.full,
                      backgroundColor:
                        activeCity === territory
                          ? colors.accent.primary
                          : colors.bg.input,
                      borderWidth: 1,
                      borderColor:
                        activeCity === territory
                          ? colors.accent.primary
                          : colors.border.default,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: Typography.fontSemibold,
                        fontSize: Typography.size.sm,
                        color:
                          activeCity === territory
                            ? "#fff"
                            : colors.text.secondary,
                      }}
                    >
                      {territory}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </View>
      </FadeInItem>

      {isLoading ? (
        <View style={{ flex: 1, paddingTop: 16, paddingHorizontal: 16, gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <ShimmerSkeleton key={i} height={145} radius={Radii.xl} />
          ))}
        </View>
      ) : isError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            paddingHorizontal: 32,
          }}
        >
              <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.status.dangerDim,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            <Feather name="wifi-off" size={28} color={colors.accent.danger} />
          </View>
          <Text
            style={{
              fontFamily: Typography.fontBold,
              fontSize: Typography.size.lg,
              color: colors.text.primary,
              textAlign: "center",
            }}
          >
            Не удалось загрузить магазины
          </Text>
          <Text
            style={{
              fontFamily: Typography.fontRegular,
              fontSize: Typography.size.sm,
              color: colors.text.tertiary,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Проверьте подключение к интернету и попробуйте снова
          </Text>
          <PressableScale onPress={() => refetch()} haptic="light">
            <LinearGradient
              colors={Gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: Radii.lg,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: Typography.size.sm,
                  color: "#fff",
                }}
              >
                Повторить
              </Text>
            </LinearGradient>
          </PressableScale>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          stickySectionHeadersEnabled={false}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Feather
                  name="map-pin"
                  size={12}
                  color={colors.accent.primary}
                />
                <Text
                  style={{
                    fontFamily: Typography.fontBold,
                    fontSize: Typography.size.sm,
                    color: colors.text.secondary,
                    letterSpacing: 0.5,
                  }}
                >
                  {section.label.toUpperCase()}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: Typography.size.sm,
                  color: colors.text.muted,
                  backgroundColor: colors.bg.elevated,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: Radii.full,
                }}
              >
                {section.data.length}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 80,
                gap: 16,
              }}
            >
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                backgroundColor: colors.brand.primaryDim,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LinearGradient
                  colors={isDark
                    ? ["rgba(124,127,245,0.15)", "rgba(124,127,245,0.05)"]
                    : ["rgba(85,88,232,0.12)", "rgba(85,88,232,0.04)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather
                    name="shopping-bag"
                    size={36}
                    color={colors.accent.primary}
                  />
                </LinearGradient>
              </View>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    fontFamily: Typography.fontBold,
                    fontSize: Typography.size.lg,
                    color: colors.text.primary,
                  }}
                >
                  {search || activeCity ? "Нет совпадений" : "Нет магазинов"}
                </Text>
                <Text
                  style={{
                    fontFamily: Typography.fontRegular,
                    fontSize: Typography.size.sm,
                    color: colors.text.tertiary,
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  {search || activeCity
                    ? "Попробуйте изменить поисковый запрос"
                    : "Добавьте первый магазин, чтобы начать работу"}
                </Text>
              </View>
              {!search && !activeCity && (
                <PressableScale
                  onPress={() => router.push("/shop/new")}
                  haptic="light"
                >
                  <LinearGradient
                    colors={Gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: Radii.lg,
                      marginTop: 4,
                    }}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                    <Text
                      style={{
                        fontFamily: Typography.fontSemibold,
                        fontSize: Typography.size.sm,
                        color: "#fff",
                      }}
                    >
                      Добавить магазин
                    </Text>
                  </LinearGradient>
                </PressableScale>
              )}
            </View>
          }
          renderItem={({ item: s, index }) => (
            <ShopCard
              shop={s}
              colors={colors}
              isDark={isDark}
              index={index}
              distance={sortByDistance && location ? s._distance : undefined}
              estimatedTime={sortByDistance && location ? s._estimatedTime : undefined}
              onView={() =>
                router.push({
                  pathname: "/shop/[id]",
                  params: { id: String(s.id) },
                })
              }
              onOrder={() =>
                router.push({
                  pathname: "/order/new",
                  params: { shopId: String(s.id), shopName: s.name ?? "" },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}
