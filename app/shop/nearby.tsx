import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii, ThemeColors } from "../../src/theme";
import { Card, Button, Badge, SearchInput, EmptyState, ScreenHeader } from "../../src/components/ui";
import { FadeInItem, PressableScale } from "../../src/components/Animated";
import { getMyShops, type Shop } from "../../src/api";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocation, getDistanceKm, getEstimatedTime } from "../../src/hooks/useLocation";

// Distance badge
function DistanceBadge({ distance }: { distance: number }) {
  const color = distance < 1 ? "#10b981" : distance < 3 ? "#f59e0b" : "#6b7280";
  return (
    <View style={[styles.distanceBadge, { backgroundColor: color + "15" }]}>
      <Feather name="map-pin" size={10} color={color} />
      <Text style={[styles.distanceText, { color }]}>
        {distance < 1 ? `${Math.round(distance * 1000)} м` : `${distance.toFixed(1)} км`}
      </Text>
    </View>
  );
}

// Shop card component
function ShopCard({
  shop,
  distance,
  estimatedTime,
  onSelect,
  colors,
  index,
}: {
  shop: Shop;
  distance: number;
  estimatedTime: string;
  onSelect: () => void;
  colors: ThemeColors;
  index: number;
}) {
  return (
    <FadeInItem delay={index * 50}>
      <PressableScale onPress={onSelect} scaleTo={0.98}>
        <Card style={[styles.shopCard, { backgroundColor: colors.bg.card }]}>
          <View style={styles.shopCardHeader}>
            <View style={styles.shopInfo}>
              <Text style={[styles.shopName, { color: colors.text.primary }]} numberOfLines={1}>
                {shop.name}
              </Text>
              {shop.address && (
                <Text style={[styles.shopAddress, { color: colors.text.secondary }]} numberOfLines={1}>
                  {shop.address}
                </Text>
              )}
              {shop.city && (
                <Text style={[styles.shopCity, { color: colors.text.tertiary }]}>
                  {shop.city}{shop.district ? `, ${shop.district}` : ""}
                </Text>
              )}
            </View>
            <View style={styles.shopMeta}>
              <DistanceBadge distance={distance} />
              <Text style={[styles.estimatedTime, { color: colors.text.secondary }]}>
                ~{estimatedTime}
              </Text>
            </View>
          </View>

          <View style={styles.shopCardFooter}>
            <View style={styles.shopStats}>
              {shop.debt && Number(shop.debt) > 0 && (
                <Badge variant="danger" icon="alert-circle">
                  Долг: {Number(shop.debt).toLocaleString("ru")} сум
                </Badge>
              )}
            </View>
            <View style={styles.selectButton}>
              <Button variant="primary" size="sm" icon="shopping-cart">
                Заказать
              </Button>
            </View>
          </View>
        </Card>
      </PressableScale>
    </FadeInItem>
  );
}

// Main component
export default function NearbyShopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { location, error: locationError, loading: locationLoading, refresh: refreshLocation } = useLocation();
  const [search, setSearch] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);

  // Fetch shops
  const { data: shops, isLoading, refetch } = useQuery({
    queryKey: ["myShops"],
    queryFn: getMyShops,
  });

  // Calculate distances and filter by radius
  const nearbyShops = (shops ?? [])
    .map((shop) => {
      const lat = Number(shop.gpsLat);
      const lng = Number(shop.gpsLng);
      if (!lat || !lng || !location) return null;
      const distance = getDistanceKm(location.latitude, location.longitude, lat, lng);
      return { ...shop, distance, estimatedTime: getEstimatedTime(distance) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s) => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);

  const handleRefresh = async () => {
    await Promise.all([refetch(), refreshLocation()]);
  };

  // Filter by search
  const filteredShops = nearbyShops.filter((s) =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.address?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase())
  );

  // Handle shop selection
  function handleSelectShop(shop: Shop) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/order/new",
      params: { shopId: shop.id, shopName: shop.name },
    });
  }

  // Radius filter options
  const radiusOptions = [1, 3, 5, 10, 25];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header */}
      <ScreenHeader
        title="Ближайшие магазины"
        subtitle={location ? "Отсортировано по расстоянию" : locationLoading ? "Определяем местоположение..." : locationError || "Геолокация недоступна"}
        right={
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.refreshButton, { backgroundColor: colors.bg.secondary }]}
          >
            <Feather name="refresh-cw" size={18} color={colors.accent.primary} />
          </TouchableOpacity>
        }
      />

      {/* Location status */}
      {locationError && (
        <View style={[styles.locationError, { backgroundColor: colors.status.warningDim }]}>
          <Feather name="alert-triangle" size={14} color={colors.status.warning} />
          <Text style={[styles.locationErrorText, { color: colors.status.warning }]}>
            {locationError}
          </Text>
        </View>
      )}

      {!location && !locationError && (
        <View style={[styles.locationLoading, { backgroundColor: colors.bg.secondary }]}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={[styles.locationLoadingText, { color: colors.text.secondary }]}>
            Определяем местоположение...
          </Text>
        </View>
      )}

      {/* Search and filters */}
      <View style={styles.filtersContainer}>
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск магазинов..."
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.radiusFilter}>
          {radiusOptions.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => {
                Haptics.selectionAsync();
                setRadiusKm(r);
              }}
              style={[
                styles.radiusChip,
                {
                  backgroundColor: radiusKm === r ? colors.accent.primary : colors.bg.secondary,
                  borderColor: radiusKm === r ? colors.accent.primary : colors.border.default,
                },
              ]}
            >
              <Text
                style={[
                  styles.radiusChipText,
                  { color: radiusKm === r ? "#fff" : colors.text.primary },
                ]}
              >
                {r} км
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Shops list */}
      <ScrollView
        style={styles.shopsList}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || locationLoading}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.skeletonCard, { backgroundColor: colors.bg.secondary }]} />
            ))}
          </View>
        ) : filteredShops.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title={
              !location
                ? "Включите геолокацию"
                : nearbyShops.length === 0
                ? "Нет магазинов в радиусе"
                : "Ничего не найдено"
            }
            description={
              !location
                ? "Для поиска ближайших магазинов 필요ен доступ к геолокации"
                : nearbyShops.length === 0
                ? `Магазинов в пределах ${radiusKm} км не найдено`
                : "Попробуйте изменить поисковый запрос"
            }
          />
        ) : (
          <>
            <View style={styles.resultsHeader}>
              <Text style={[styles.resultsCount, { color: colors.text.secondary }]}>
                {filteredShops.length} магазин{filteredShops.length === 1 ? "" : filteredShops.length < 5 ? "а" : "ов"}
              </Text>
            </View>
            {filteredShops.map((shop, index) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                distance={shop.distance}
                estimatedTime={shop.estimatedTime}
                onSelect={() => handleSelectShop(shop)}
                colors={colors}
                index={index}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  locationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: Radii.md,
  },
  locationErrorText: {
    fontSize: 12,
    fontFamily: Typography.fontMedium,
  },
  locationLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: Radii.md,
  },
  locationLoadingText: {
    fontSize: 12,
    fontFamily: Typography.fontMedium,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  radiusFilter: {
    flexGrow: 0,
  },
  radiusChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  radiusChipText: {
    fontSize: 13,
    fontFamily: Typography.fontMedium,
  },
  shopsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  resultsCount: {
    fontSize: 13,
    fontFamily: Typography.fontMedium,
  },
  shopCard: {
    marginBottom: 12,
    padding: 16,
  },
  shopCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  shopInfo: {
    flex: 1,
    marginRight: 12,
  },
  shopName: {
    fontSize: 16,
    fontFamily: Typography.fontBold,
    marginBottom: 4,
  },
  shopAddress: {
    fontSize: 13,
    marginBottom: 2,
  },
  shopCity: {
    fontSize: 12,
  },
  shopMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distanceText: {
    fontSize: 11,
    fontFamily: Typography.fontMedium,
  },
  estimatedTime: {
    fontSize: 11,
  },
  shopCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: 12,
  },
  shopStats: {
    flex: 1,
  },
  selectButton: {
    marginLeft: 12,
  },
  loadingContainer: {
    gap: 12,
  },
  skeletonCard: {
    height: 120,
    borderRadius: Radii.lg,
  },
});
