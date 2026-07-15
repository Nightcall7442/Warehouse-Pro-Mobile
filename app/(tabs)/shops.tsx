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
import { getMyShops, getAllShopsForSupervisor, Shop } from "../../src/api";
import { usePerformanceMonitor } from "../../src/hooks/usePerformanceMonitor";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { useLocation, getDistanceKm, getEstimatedTime } from "../../src/hooks/useLocation";
import * as Haptics from "expo-haptics";
import {
  WebColors,
  WebShadows,
  WebTypography,
  WebSpacing,
  WebRadii,
} from "../../src/theme-web-match";
import { ScreenHeader } from "../../src/components/ui";
import {
  FadeInItem,
  PressableScale,
  ShimmerSkeleton,
} from "../../src/components/Animated";

// ── Helpers ──────────────────────────────────────────────────────────────────

function c(isDark: boolean) {
  return isDark ? WebColors.dark : WebColors.light;
}

function s(isDark: boolean) {
  return isDark ? WebShadows.dark : WebShadows.light;
}

// ── KPI Hero Card (matches web .kpi-hero) ────────────────────────────────────

function KpiHeroCard({
  label,
  value,
  icon,
  gradient,
  isDark,
  index,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  gradient: string;
  isDark: boolean;
  index: number;
}) {
  const col = c(isDark);
  const sh = s(isDark);

  return (
    <FadeInItem delay={index * 40}>
      <View
        style={{
          backgroundColor: col.surface,
          borderRadius: WebRadii.xxl,
          borderWidth: 1,
          borderColor: col.border,
          padding: WebSpacing["2xl"],
          ...sh.sm,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: WebTypography.family,
              fontSize: 10,
              fontWeight: WebTypography.weight.semibold as any,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: col.textTertiary,
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontFamily: WebTypography.family,
              fontSize: 32,
              fontWeight: WebTypography.weight.bold as any,
              color: col.textPrimary,
              marginTop: WebSpacing.sm + 4,
              lineHeight: 36,
              letterSpacing: -0.96,
            }}
          >
            {value}
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: gradient,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
      </View>
    </FadeInItem>
  );
}

// ── Shop Card (matches web neo-card / ShopCard) ──────────────────────────────

const ShopCard = React.memo(function ShopCard({
  shop,
  onOrder,
  onView,
  isDark,
  index,
  distance,
  estimatedTime,
}: {
  shop: Shop;
  onOrder: () => void;
  onView: () => void;
  isDark: boolean;
  index: number;
  distance?: number;
  estimatedTime?: string;
}) {
  const col = c(isDark);
  const sh = s(isDark);
  const hasDebt = Number(shop.debt ?? 0) > 0;
  const isActive = shop.status !== "inactive";

  return (
    <FadeInItem delay={index * 40} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <PressableScale onPress={onView} haptic="light" scaleTo={0.98}>
        <View
          style={{
            backgroundColor: col.surface,
            borderRadius: WebRadii.xxl,
            borderWidth: 1,
            borderColor: col.border,
            padding: WebSpacing.xl,
            ...sh.md,
            flexDirection: "row",
            alignItems: "center",
            gap: WebSpacing.lg,
          }}
        >
          {/* Photo — web uses w-20 h-20 (80px) for lg */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: WebRadii.lg,
              overflow: "hidden",
              backgroundColor: "rgba(75,108,246,.08)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: col.borderSubtle,
            }}
          >
            {shop.photoUrl ? (
              <Image
                source={{ uri: shop.photoUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <Feather name="shopping-bag" size={22} color={col.primary} />
            )}
          </View>

          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.lg,
                    fontWeight: WebTypography.weight.semibold as any,
                    color: col.textPrimary,
                  }}
                  numberOfLines={1}
                >
                  {shop.name}
                </Text>
                {shop.ownerName && (
                  <Text
                    style={{
                      fontFamily: WebTypography.family,
                      fontSize: WebTypography.size.xs + 1,
                      color: col.textSecondary,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {shop.ownerName}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {hasDebt && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: col.dangerSubtle,
                      borderRadius: WebRadii.full,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Feather name="alert-circle" size={11} color={col.danger} />
                    <Text
                      style={{
                        fontFamily: WebTypography.family,
                        fontSize: WebTypography.size.xs + 1,
                        fontWeight: WebTypography.weight.semibold as any,
                        color: col.danger,
                      }}
                    >
                      {Number(shop.debt).toLocaleString("ru")}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    backgroundColor: isActive ? "rgba(74,222,128,.15)" : col.surfaceLight,
                    borderRadius: WebRadii.full,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: WebTypography.family,
                      fontSize: 10,
                      fontWeight: WebTypography.weight.medium as any,
                      color: isActive ? "#34c473" : col.textSecondary,
                    }}
                  >
                    {isActive ? "Актив" : "Неактив"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={col.textSecondary} />
              </View>
            </View>

            {/* Location + distance row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {(shop.district || shop.address) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="map-pin" size={10} color={col.textSecondary} />
                  <Text
                    style={{
                      fontFamily: WebTypography.family,
                      fontSize: 11,
                      color: col.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    {[shop.city, shop.district, shop.address].filter(Boolean).join(", ")}
                  </Text>
                </View>
              )}

              {distance !== undefined && distance !== Infinity && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor:
                        distance < 1
                          ? col.successSubtle
                          : distance < 3
                          ? col.warningSubtle
                          : col.surfaceLight,
                      borderRadius: WebRadii.full,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Feather
                      name="navigation"
                      size={10}
                      color={distance < 1 ? col.success : distance < 3 ? col.warning : col.textTertiary}
                    />
                    <Text
                      style={{
                        fontFamily: WebTypography.family,
                        fontSize: 11,
                        fontWeight: WebTypography.weight.medium as any,
                        color: distance < 1 ? col.success : distance < 3 ? col.warning : col.textTertiary,
                      }}
                    >
                      {distance < 1 ? `${Math.round(distance * 1000)} м` : `${distance.toFixed(1)} км`}
                    </Text>
                  </View>
                  {estimatedTime && (
                    <Text style={{ fontFamily: WebTypography.family, fontSize: 11, color: col.textTertiary }}>
                      ~{estimatedTime}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Order button — web neo-btn-primary */}
          <View style={{ justifyContent: "center", flexShrink: 0 }}>
            <PressableScale onPress={onOrder} haptic="medium" scaleTo={0.95}>
              <View
                style={{
                  backgroundColor: col.primary,
                  borderRadius: WebRadii.md,
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  ...s(isDark).xs,
                }}
              >
                <Feather name="shopping-cart" size={18} color="#fff" />
              </View>
            </PressableScale>
          </View>
        </View>
      </PressableScale>
    </FadeInItem>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────

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

  const col = c(isDark);
  const sh = s(isDark);

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
      const city = s.city || "";
      const district = s.district || "";
      const territory = district ? `${city} — ${district}` : city;
      const matchesTerritory = !activeCity || territory === activeCity;
      return matchesSearch && matchesTerritory;
    }).map((s) => ({ ...s, _distance: Infinity, _estimatedTime: "" }));

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
  }, [shops, search, activeCity, sortByDistance, location]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const all = shops ?? [];
    const total = all.length;
    const activeCount = all.filter((s) => s.status !== "inactive").length;
    const debtCount = all.filter((s) => Number(s.debt ?? 0) > 0).length;
    const totalDebt = all.reduce((sum, s) => sum + Number(s.debt ?? 0), 0);
    return { total, activeCount, debtCount, totalDebt };
  }, [shops]);

  const sections = useMemo(() => {
    if (sortByDistance && location) {
      return [{
        key: "distance",
        label: "По расстоянию",
        data: filtered,
      }];
    }

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
    <View style={{ flex: 1, backgroundColor: col.canvas }}>
      <ScreenHeader
        title="Магазины"
        right={
          <View style={{ flexDirection: "row", gap: WebSpacing.sm }}>
            {location && (
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync();
                  setSortByDistance(!sortByDistance);
                }}
                haptic="light"
              >
                <View
                  style={{
                    backgroundColor: sortByDistance ? col.primary : col.surface,
                    borderRadius: WebRadii.full,
                    borderWidth: sortByDistance ? 0 : 1,
                    borderColor: col.border,
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    ...sh.xs,
                  }}
                >
                  <Feather
                    name={sortByDistance ? "check" : "navigation"}
                    size={18}
                    color={sortByDistance ? "#fff" : col.textPrimary}
                  />
                </View>
              </PressableScale>
            )}
            <PressableScale
              onPress={() => router.push("/shop/new")}
              haptic="light"
            >
              <View
                style={{
                  backgroundColor: col.primary,
                  borderRadius: WebRadii.full,
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  ...sh.xs,
                }}
              >
                <Feather name="plus" size={20} color="#fff" />
              </View>
            </PressableScale>
          </View>
        }
      />

      {/* KPI Stats Row — matches web ShopStats grid */}
      <View style={{ paddingHorizontal: 16, gap: WebSpacing.lg }}>
        <View style={{ flexDirection: "row", gap: WebSpacing.md }}>
          <View style={{ flex: 1 }}>
            <KpiHeroCard
              label="ВСЕГО МАГАЗИНОВ"
              value={String(kpiStats.total)}
              icon={<Feather name="shopping-bag" size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #4b6cf6, #4b6cf6)"
              isDark={isDark}
              index={0}
            />
          </View>
          <View style={{ flex: 1 }}>
            <KpiHeroCard
              label="АКТИВНЫЕ"
              value={String(kpiStats.activeCount)}
              icon={<Feather name="users" size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #16a34a, #22c47a)"
              isDark={isDark}
              index={1}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: WebSpacing.md }}>
          <View style={{ flex: 1 }}>
            <KpiHeroCard
              label="С ДОЛГОМ"
              value={String(kpiStats.debtCount)}
              icon={<Feather name="alert-circle" size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #fb923c, #f97316)"
              isDark={isDark}
              index={2}
            />
          </View>
          <View style={{ flex: 1 }}>
            <KpiHeroCard
              label="ОБЩИЙ ДОЛГ"
              value={kpiStats.totalDebt.toLocaleString("ru")}
              icon={<Feather name="dollar-sign" size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #e85050, #e85050)"
              isDark={isDark}
              index={3}
            />
          </View>
        </View>
      </View>

      {/* Filter bar — matches web ShopFilters */}
      <FadeInItem delay={100}>
        <View style={{ paddingHorizontal: 16, paddingTop: WebSpacing.lg }}>
          <View
            style={{
              backgroundColor: col.surface,
              borderRadius: WebRadii.lg,
              padding: WebSpacing.lg,
              borderWidth: 1,
              borderColor: col.border,
              ...sh.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: WebSpacing.md,
              flexWrap: "wrap",
            }}
          >
            {/* Search input — web neo-input style */}
            <View style={{ flex: 1, minWidth: 200 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: col.surfaceLight,
                  borderRadius: WebRadii.md,
                  borderWidth: 1.5,
                  borderColor: "transparent",
                  paddingHorizontal: 14,
                  paddingVertical: WebSpacing.sm + 2,
                }}
              >
                <Feather name="search" size={16} color={col.textSecondary} />
                <TextInput
                  style={{
                    flex: 1,
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.sm,
                    color: col.textPrimary,
                    paddingVertical: 0,
                  }}
                  placeholder="Поиск магазинов…"
                  placeholderTextColor={col.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && (
                  <PressableScale onPress={() => setSearch("")} haptic="selection">
                    <Feather name="x" size={15} color={col.textSecondary} />
                  </PressableScale>
                )}
              </View>
            </View>
          </View>

          {/* Territory chips — web filter chip style */}
          {territories.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: WebSpacing.md }}
              contentContainerStyle={{ gap: WebSpacing.sm }}
            >
              <PressableScale
                onPress={() => setActiveCity(null)}
                haptic="selection"
              >
                <View
                  style={{
                    backgroundColor: !activeCity ? col.primary : col.surface,
                    borderRadius: WebRadii.full,
                    borderWidth: !activeCity ? 0 : 1,
                    borderColor: col.border,
                    paddingHorizontal: WebSpacing.base + 2,
                    paddingVertical: WebSpacing.sm + 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: WebTypography.family,
                      fontSize: WebTypography.size.sm,
                      fontWeight: WebTypography.weight.semibold as any,
                      color: !activeCity ? "#fff" : col.textSecondary,
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
                      backgroundColor: activeCity === territory ? col.primary : col.surface,
                      borderRadius: WebRadii.full,
                      borderWidth: activeCity === territory ? 0 : 1,
                      borderColor: col.border,
                      paddingHorizontal: WebSpacing.base + 2,
                      paddingVertical: WebSpacing.sm + 2,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: WebTypography.family,
                        fontSize: WebTypography.size.sm,
                        fontWeight: WebTypography.weight.semibold as any,
                        color:
                          activeCity === territory
                            ? "#fff"
                            : col.textSecondary,
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
        <View style={{ flex: 1, paddingTop: WebSpacing.lg, paddingHorizontal: 16, gap: WebSpacing.md }}>
          {[1, 2, 3, 4].map((i) => (
            <ShimmerSkeleton key={i} height={145} radius={WebRadii.xxl} />
          ))}
        </View>
      ) : isError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: WebSpacing.lg,
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: col.surface,
              borderWidth: 1,
              borderColor: col.border,
              ...sh.sm,
              marginBottom: 4,
            }}
          >
            <Feather name="wifi-off" size={28} color={col.danger} />
          </View>
          <Text
            style={{
              fontFamily: WebTypography.family,
              fontSize: WebTypography.size.lg,
              fontWeight: WebTypography.weight.bold as any,
              color: col.textPrimary,
              textAlign: "center",
            }}
          >
            Не удалось загрузить магазины
          </Text>
          <Text
            style={{
              fontFamily: WebTypography.family,
              fontSize: WebTypography.size.sm,
              color: col.textTertiary,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Проверьте подключение к интернету и попробуйте снова
          </Text>
          <PressableScale onPress={() => refetch()} haptic="light">
            <View
              style={{
                backgroundColor: col.primary,
                borderRadius: WebRadii.md,
                paddingVertical: 12,
                paddingHorizontal: 20,
                marginTop: WebSpacing.sm + 4,
                ...sh.xs,
              }}
            >
              <Text
                style={{
                  fontFamily: WebTypography.family,
                  fontSize: WebTypography.size.sm,
                  fontWeight: WebTypography.weight.semibold as any,
                  color: "#fff",
                }}
              >
                Повторить
              </Text>
            </View>
          </PressableScale>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingTop: WebSpacing.lg, paddingBottom: insets.bottom + 24 }}
          stickySectionHeadersEnabled={false}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={col.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: WebSpacing.base + 2,
                paddingBottom: WebSpacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="map-pin" size={12} color={col.primary} />
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.sm,
                    fontWeight: WebTypography.weight.bold as any,
                    color: col.textSecondary,
                    letterSpacing: 0.5,
                  }}
                >
                  {section.label.toUpperCase()}
                </Text>
              </View>
              {/* Badge — web style */}
              <View
                style={{
                  backgroundColor: col.primary,
                  borderRadius: WebRadii.sm,
                  paddingHorizontal: WebSpacing.sm + 2,
                  paddingVertical: WebSpacing.xs,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.xs,
                    fontWeight: WebTypography.weight.semibold as any,
                    color: "#fff",
                  }}
                >
                  {section.data.length}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 80,
                gap: WebSpacing.xl,
              }}
            >
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: col.surface,
                  borderWidth: 1,
                  borderColor: col.border,
                  ...sh.md,
                }}
              >
                <Feather name="shopping-bag" size={36} color={col.primary} />
              </View>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.lg,
                    fontWeight: WebTypography.weight.bold as any,
                    color: col.textPrimary,
                  }}
                >
                  {search || activeCity ? "Нет совпадений" : "Нет магазинов"}
                </Text>
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.sm,
                    color: col.textTertiary,
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
                  <View
                    style={{
                      backgroundColor: col.primary,
                      borderRadius: WebRadii.md,
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: WebSpacing.sm,
                      marginTop: WebSpacing.xs,
                      ...sh.xs,
                    }}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                    <Text
                      style={{
                        fontFamily: WebTypography.family,
                        fontSize: WebTypography.size.sm,
                        fontWeight: WebTypography.weight.semibold as any,
                        color: "#fff",
                      }}
                    >
                      Добавить магазин
                    </Text>
                  </View>
                </PressableScale>
              )}
            </View>
          }
          renderItem={({ item: s, index }) => (
            <ShopCard
              shop={s}
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

interface ShopWithDistance extends Shop {
  _distance: number;
  _estimatedTime: string;
}
