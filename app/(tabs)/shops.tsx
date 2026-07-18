// Warehouse Pro — Agent Shops (matches web AgentShops.tsx)
import React, { useMemo, useState } from "react";
import { View, Text, Image, RefreshControl, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMyShops, getAllShopsForSupervisor, Shop } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { useLocation, getDistanceKm, getEstimatedTime } from "../../src/hooks/useLocation";
import * as Haptics from "expo-haptics";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { ScreenHeader, SearchInput, Badge } from "../../src/components/ui";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";

function ShopCard({ shop, isDark, colors, index, distance, estimatedTime, onView, onOrder }: {
  shop: Shop; isDark: boolean; colors: ThemeColors; index: number;
  distance?: number; estimatedTime?: string; onView: () => void; onOrder: () => void;
}) {
  const hasDebt = Number(shop.debt ?? 0) > 0;
  const isActive = shop.status !== "inactive";
  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  return (
    <FadeInItem delay={index * 40} style={{ marginHorizontal: 16, marginBottom: 10 }}>
      <PressableScale onPress={onView} haptic="light" scaleTo={0.98}>
        <View style={{
          backgroundColor: colors.bg.card, borderRadius: Radii.xxl, borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
          padding: Spacing.xl, flexDirection: "row", alignItems: "center", gap: Spacing.lg,
          shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
        }}>
          {/* Photo */}
          <View style={{ width: 72, height: 72, borderRadius: Radii.lg, overflow: "hidden", backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.subtle }}>
            {shop.photoUrl ? (
              <Image source={{ uri: shop.photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Feather name="shopping-bag" size={22} color={colors.accent.primary} />
            )}
          </View>
          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{shop.name}</Text>
                {shop.ownerName && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>{shop.ownerName}</Text>}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {hasDebt && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.status.dangerDim, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Feather name="alert-circle" size={10} color={colors.status.danger} />
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: colors.status.danger }}>{Number(shop.debt).toLocaleString("ru")}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: isActive ? colors.status.successDim : colors.bg.elevated, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: isActive ? colors.status.success : colors.text.secondary }}>{isActive ? "Актив" : "Неактив"}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.text.secondary} />
              </View>
            </View>
            {(shop.district || shop.address) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                <Feather name="map-pin" size={10} color={colors.text.secondary} />
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.secondary }} numberOfLines={1}>
                  {[shop.city, shop.district, shop.address].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}
            {distance !== undefined && distance !== Infinity && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: distance < 1 ? colors.status.successDim : colors.status.warningDim, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Feather name="navigation" size={10} color={distance < 1 ? colors.status.success : colors.status.warning} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: distance < 1 ? colors.status.success : colors.status.warning }}>
                    {distance < 1 ? `${Math.round(distance * 1000)} м` : `${distance.toFixed(1)} км`}
                  </Text>
                </View>
                {estimatedTime && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.tertiary }}>~{estimatedTime}</Text>}
              </View>
            )}
          </View>
          {/* Order button */}
          <PressableScale onPress={onOrder} haptic="medium" scaleTo={0.95}>
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Feather name="shopping-cart" size={18} color="#fff" />
            </View>
          </PressableScale>
        </View>
      </PressableScale>
    </FadeInItem>
  );
}

interface ShopWithDistance extends Shop { _distance: number; _estimatedTime: string; }

interface TerritoryGroup {
  territory: string;
  shops: ShopWithDistance[];
}

export default function ShopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const [search, setSearch] = useState("");
  const [sortByDistance, setSortByDistance] = useState(false);
  const [selectedTerritory, setSelectedTerritory] = useState<string | null>(null);
  const { location } = useLocation();

  const { data: shops, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["shops"],
    queryFn: isSupervisor ? getAllShopsForSupervisor : getMyShops,
    staleTime: 5 * 60 * 1000,
    enabled: user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator",
  });

  const filtered = useMemo(() => {
    let result: ShopWithDistance[] = (shops ?? []).filter(s =>
      !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.ownerName?.toLowerCase().includes(search.toLowerCase()) || s.district?.toLowerCase().includes(search.toLowerCase())
    ).map(s => ({ ...s, _distance: Infinity, _estimatedTime: "" }));

    if (sortByDistance && location) {
      result = result.map(s => {
        const lat = Number(s.gpsLat), lng = Number(s.gpsLng);
        if (!lat || !lng) return { ...s, _distance: Infinity, _estimatedTime: "" };
        return { ...s, _distance: getDistanceKm(location.latitude, location.longitude, lat, lng), _estimatedTime: getEstimatedTime(getDistanceKm(location.latitude, location.longitude, lat, lng)) };
      }).sort((a, b) => a._distance - b._distance);
    }
    return result;
  }, [shops, search, sortByDistance, location]);

  // Group by territory (district || city)
  const territories = useMemo<TerritoryGroup[]>(() => {
    if (sortByDistance && location) return [{ territory: "По расстоянию", shops: filtered }];
    const map = new Map<string, ShopWithDistance[]>();
    for (const s of filtered) {
      const territory = s.district || s.city || "Другие";
      if (!map.has(territory)) map.set(territory, []);
      map.get(territory)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([territory, shops]) => ({ territory, shops }));
  }, [filtered, sortByDistance, location]);

  const selectedShops = useMemo(() => {
    if (!selectedTerritory) return [];
    if (selectedTerritory === "__all__") return filtered;
    return territories.find(t => t.territory === selectedTerritory)?.shops ?? [];
  }, [territories, selectedTerritory, filtered]);

  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  // Territory list view
  if (selectedTerritory) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
            <PressableScale onPress={() => { setSelectedTerritory(null); }} haptic="none">
              <View style={{ width: 36, height: 36, borderRadius: Radii.full, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.default }}>
                <Feather name="arrow-left" size={18} color={colors.text.primary} />
              </View>
            </PressableScale>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xl, color: colors.text.primary }} numberOfLines={1}>
                {selectedTerritory === "__all__" ? "Все магазины" : selectedTerritory}
              </Text>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{selectedShops.length} магазинов</Text>
            </View>
          </View>
        </View>
        {isLoading ? (
          <View style={{ flex: 1, paddingTop: Spacing.lg, paddingHorizontal: 16, gap: Spacing.md }}>
            {[1, 2, 3, 4].map(i => <ShimmerSkeleton key={i} height={120} radius={Radii.xxl} />)}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}>
            {selectedShops.map((s, idx) => (
              <ShopCard key={s.id} shop={s} isDark={isDark} colors={colors} index={idx}
                distance={sortByDistance && location ? s._distance : undefined}
                estimatedTime={sortByDistance && location ? s._estimatedTime : undefined}
                onView={() => router.push({ pathname: "/shop/[id]", params: { id: String(s.id) } })}
                onOrder={() => router.push({ pathname: "/order/new", params: { shopId: String(s.id), shopName: s.name ?? "" } })}
              />
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // Territory list (top-level)
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Магазины"
        right={
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            {location && (
              <PressableScale onPress={() => { setSortByDistance(!sortByDistance); }} haptic="none">
                <View style={{ backgroundColor: sortByDistance ? colors.accent.primary : colors.bg.elevated, borderRadius: Radii.full, borderWidth: sortByDistance ? 0 : 1, borderColor: colors.border.default, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                  <Feather name={sortByDistance ? "check" : "navigation"} size={18} color={sortByDistance ? "#fff" : colors.text.primary} />
                </View>
              </PressableScale>
            )}
            <PressableScale onPress={() => router.push("/shop/new")} haptic="light">
              <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color="#fff" />
              </View>
            </PressableScale>
          </View>
        }
      />
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md }}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск магазинов…" />
      </View>
      {isLoading ? (
        <View style={{ flex: 1, paddingTop: Spacing.lg, paddingHorizontal: 16, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => <ShimmerSkeleton key={i} height={120} radius={Radii.xxl} />)}
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg, paddingHorizontal: 32 }}>
          <Feather name="wifi-off" size={28} color={colors.status.danger} />
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.lg, color: colors.text.primary, textAlign: "center" }}>Не удалось загрузить</Text>
          <PressableScale onPress={() => refetch()} haptic="light">
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: 20 }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: "#fff" }}>Повторить</Text>
            </View>
          </PressableScale>
        </View>
      ) : sortByDistance && location ? (
        // Distance mode: flat list
        <ScrollView contentContainerStyle={{ paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}>
          {filtered.map((s, idx) => (
            <ShopCard key={s.id} shop={s} isDark={isDark} colors={colors} index={idx}
              distance={s._distance} estimatedTime={s._estimatedTime}
              onView={() => router.push({ pathname: "/shop/[id]", params: { id: String(s.id) } })}
              onOrder={() => router.push({ pathname: "/order/new", params: { shopId: String(s.id), shopName: s.name ?? "" } })}
            />
          ))}
        </ScrollView>
      ) : (
        // Territory drill-down view
        <ScrollView contentContainerStyle={{ paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}>
          {/* All shops button */}
          <PressableScale onPress={() => { setSelectedTerritory("__all__"); }} haptic="none" style={{ marginHorizontal: 16, marginBottom: 10 }}>
            <View style={{
              backgroundColor: colors.bg.card, borderRadius: Radii.xxl, borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
              padding: Spacing.xl, flexDirection: "row", alignItems: "center", gap: Spacing.lg,
              shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
            }}>
              <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="globe" size={22} color={colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>Все магазины</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{filtered.length} магазинов</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.text.secondary} />
            </View>
          </PressableScale>

          {/* Territory cards */}
          {territories.map((group, idx) => (
            <FadeInItem key={group.territory} delay={idx * 40} style={{ marginHorizontal: 16, marginBottom: 10 }}>
              <PressableScale onPress={() => { setSelectedTerritory(group.territory); }} haptic="none">
                <View style={{
                  backgroundColor: colors.bg.card, borderRadius: Radii.xxl, borderWidth: 1,
                  borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
                  padding: Spacing.xl, flexDirection: "row", alignItems: "center", gap: Spacing.lg,
                  shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
                }}>
                  <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="map-pin" size={22} color={colors.accent.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{group.territory}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{group.shops.length} магазинов</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.text.secondary} />
                </View>
              </PressableScale>
            </FadeInItem>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
