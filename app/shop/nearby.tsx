// Warehouse Pro — Nearby Shops v2 (cold palette, Card, Badge, FadeInItem)
import { useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii } from "../../src/theme";
import { Card, Button, Badge, SearchInput, EmptyState, ScreenHeader } from "../../src/components/ui";
import { FadeInItem, PressableScale } from "../../src/components/Animated";
import { getMyShops, type Shop } from "../../src/api";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocation, getDistanceKm, getEstimatedTime } from "../../src/hooks/useLocation";

function DistanceBadge({ distance }: { distance: number }) {
  const color = distance < 1 ? "#10b981" : distance < 3 ? "#f59e0b" : "#6b7280";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: color + "15" }}>
      <Feather name="map-pin" size={10} color={color} />
      <Text style={{ fontSize: 11, fontFamily: Typography.fontMedium, color }}>
        {distance < 1 ? `${Math.round(distance * 1000)} м` : `${distance.toFixed(1)} км`}
      </Text>
    </View>
  );
}

function ShopCard({ shop, distance, estimatedTime, onSelect, colors, index }: {
  shop: Shop; distance: number; estimatedTime: string; onSelect: () => void; colors: ReturnType<typeof useThemeColors>; index: number;
}) {
  return (
    <FadeInItem delay={index * 50}>
      <PressableScale onPress={onSelect} haptic="light" style={{ marginBottom: 12 }}>
        <Card style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 16, fontFamily: Typography.fontBold, color: colors.text.primary, marginBottom: 4 }} numberOfLines={1}>{shop.name}</Text>
              {shop.address && <Text style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 2 }} numberOfLines={1}>{shop.address}</Text>}
              {shop.city && <Text style={{ fontSize: 12, color: colors.text.tertiary }}>{shop.city}{shop.district ? `, ${shop.district}` : ""}</Text>}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <DistanceBadge distance={distance} />
              <Text style={{ fontSize: 11, color: colors.text.secondary }}>~{estimatedTime}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 12 }}>
            <View style={{ flex: 1 }}>
              {shop.debt && Number(shop.debt) > 0 && (
                <Badge variant="danger" icon="alert-circle">Долг: {Number(shop.debt).toLocaleString("ru")} сум</Badge>
              )}
            </View>
            <Button variant="primary" size="sm" icon="shopping-cart">Заказать</Button>
          </View>
        </Card>
      </PressableScale>
    </FadeInItem>
  );
}

export default function NearbyShopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { location, error: locationError, loading: locationLoading, refresh: refreshLocation } = useLocation();
  const [search, setSearch] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);

  const { data: shops, isLoading, refetch } = useQuery({ queryKey: ["myShops"], queryFn: getMyShops });

  const nearbyShops = (shops ?? [])
    .map(shop => {
      const lat = Number(shop.gpsLat);
      const lng = Number(shop.gpsLng);
      if (!lat || !lng || !location) return null;
      const distance = getDistanceKm(location.latitude, location.longitude, lat, lng);
      return { ...shop, distance, estimatedTime: getEstimatedTime(distance) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter(s => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);

  const handleRefresh = async () => { await Promise.all([refetch(), refreshLocation()]); };

  const filteredShops = nearbyShops.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.address?.toLowerCase().includes(search.toLowerCase()) || s.city?.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelectShop(shop: Shop) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/order/new", params: { shopId: shop.id, shopName: shop.name } });
  }

  const radiusOptions = [1, 3, 5, 10, 25];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Ближайшие магазины"
        subtitle={location ? "Отсортировано по расстоянию" : locationLoading ? "Определяем местоположение..." : locationError || "Геолокация недоступна"}
        right={
          <PressableScale onPress={handleRefresh} haptic="light">
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="refresh-cw" size={18} color={colors.accent.primary} />
            </View>
          </PressableScale>
        }
      />

      {/* Location status */}
      {locationError && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: Radii.md, backgroundColor: colors.status.warningDim }}>
          <Feather name="alert-triangle" size={14} color={colors.status.warning} />
          <Text style={{ fontSize: 12, fontFamily: Typography.fontMedium, color: colors.status.warning }}>{locationError}</Text>
        </View>
      )}
      {!location && !locationError && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: Radii.md, backgroundColor: colors.bg.secondary }}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={{ fontSize: 12, fontFamily: Typography.fontMedium, color: colors.text.secondary }}>Определяем местоположение...</Text>
        </View>
      )}

      {/* Search and filters */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск магазинов..." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {radiusOptions.map(r => (
            <PressableScale key={r} onPress={() => { Haptics.selectionAsync(); setRadiusKm(r); }} haptic="light">
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1, backgroundColor: radiusKm === r ? colors.accent.primary : colors.bg.secondary, borderColor: radiusKm === r ? colors.accent.primary : colors.border.default }}>
                <Text style={{ fontSize: 13, fontFamily: Typography.fontMedium, color: radiusKm === r ? "#fff" : colors.text.primary }}>{r} км</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      {/* Shops list */}
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={isLoading || locationLoading} onRefresh={handleRefresh} tintColor={colors.accent.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3].map(i => <View key={i} style={{ height: 120, borderRadius: Radii.lg, backgroundColor: colors.bg.secondary }} />)}
          </View>
        ) : filteredShops.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title={!location ? "Включите геолокацию" : nearbyShops.length === 0 ? "Нет магазинов в радиусе" : "Ничего не найдено"}
            description={!location ? "Для поиска ближайших магазинов нужен доступ к геолокации" : nearbyShops.length === 0 ? `Магазинов в пределах ${radiusKm} км не найдено` : "Попробуйте изменить поисковый запрос"}
          />
        ) : (
          <>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: Typography.fontMedium, color: colors.text.secondary }}>
                {filteredShops.length} магазин{filteredShops.length === 1 ? "" : filteredShops.length < 5 ? "а" : "ов"}
              </Text>
            </View>
            {filteredShops.map((shop, index) => (
              <ShopCard key={shop.id} shop={shop} distance={shop.distance} estimatedTime={shop.estimatedTime} onSelect={() => handleSelectShop(shop)} colors={colors} index={index} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
