// Warehouse Pro — Shop Detail v2 (cold palette, Card, Badge, FadeInItem)
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Linking, RefreshControl, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, soft } from "../../src/theme";
import { getShop, getShopForSupervisor, updateShop, uploadShopPhoto, uploadFile, getTerritories, Territory } from "../../src/api";
import { Card, Badge, Button, InfoRow } from "../../src/components/ui";
import { SecureImage } from "../../src/components/SecureImage";
import { preparePhoto } from "../../src/lib/prepare-photo";
import { PressableScale, FadeInItem, ShimmerSkeleton } from "../../src/components/Animated";
import { formatMoney } from "../../src/store/branding";
import { useT } from "../../src/i18n";

export default function ShopDetailScreen() {
  const { isDark } = useThemeStore();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Record<string, string>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  // null — территорию на экране ещё не выбирали, показываем ту, что в карточке.
  // Просто хранить число нельзя: «Без территории» — это тоже выбор, и он даёт
  // undefined; при откате к значению карточки он бы молча отменялся.
  //
  // Раньше значение переносили из карточки в состояние эффектом — экран сначала
  // рисовался с пустой территорией и лишь вторым проходом с настоящей.
  const [pickedTerritory, setPickedTerritory] = useState<{ id: number | undefined } | null>(null);
  const setTerritoryId = (id: number | undefined) => setPickedTerritory({ id });

  const { data: territories = [] } = useQuery({ queryKey: ["territories"], queryFn: getTerritories });

  const { data: shop, isLoading, isError, refetch } = useQuery({
    queryKey: ["shop", id],
    queryFn: () => isSupervisor ? getShopForSupervisor(Number(id)) : getShop(Number(id)),
    enabled: !!id,
  });

  const shopTerritoryId = shop ? (shop as unknown as Record<string, unknown>).territoryId as number | undefined : undefined;
  const territoryId = pickedTerritory ? pickedTerritory.id : shopTerritoryId;

  const updateMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: Partial<Record<string, string>>) => updateShop(Number(id), { ...data, territoryId } as any),
    // "availableShops" backs the order-creation picker and catalog screen —
    // a separate endpoint from "shops", so it needs its own invalidation or
    // an edited shop's debt/name/status stays stale there.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop", id] }); qc.invalidateQueries({ queryKey: ["shops"] }); qc.invalidateQueries({ queryKey: ["availableShops"] }); setEditing(false); notify.success(t("Сохранено", "Saqlandi")); },
    onError: (e: Error) => notify.error(e.message),
  });

  const photoMutation = useMutation({
    mutationFn: (url: string) => uploadShopPhoto(Number(id), url),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop", id] }); qc.invalidateQueries({ queryKey: ["shops"] }); qc.invalidateQueries({ queryKey: ["availableShops"] }); notify.success(t("Фото обновлено", "Rasm yangilandi")); },
    onError: (e: Error) => notify.error(e.message),
  });

  const PICKER_OPTS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6 };

  const uploadPicked = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets[0]?.uri) return;
    try {
      // Снимок уменьшается перед отправкой: камера отдаёт полное
      // разрешение, и без этого кадр весит мегабайты.
      const { dataUrl } = await preparePhoto(res.assets[0].uri);
      const url = await uploadFile(dataUrl, "shops");
      photoMutation.mutate(url);
    } catch (e) { notify.error(e instanceof Error ? e.message : t("Ошибка загрузки", "Yuklashda xato")); }
  };

  // Same reason as the new-shop screen: updating a shop's photo is something
  // an agent does while standing at it, and gallery-only left them no way to
  // actually take the picture.
  const pickPhoto = () => {
    Alert.alert(t("Фото магазина", "Do'kon rasmi"), undefined, [
      {
        text: t("Сделать фото", "Rasmga olish"),
        onPress: () => { void (async () => {
          const cam = await ImagePicker.requestCameraPermissionsAsync();
          if (!cam.granted) { notify.error(t("Нет доступа к камере", "Kameraga ruxsat yo'q")); return; }
          await uploadPicked(await ImagePicker.launchCameraAsync(PICKER_OPTS));
        })(); },
      },
      {
        text: t("Выбрать из галереи", "Galereyadan tanlash"),
        onPress: () => { void (async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { notify.error(t("Нет доступа к галерее", "Galereyaga ruxsat yo'q")); return; }
          await uploadPicked(await ImagePicker.launchImageLibraryAsync(PICKER_OPTS));
        })(); },
      },
      { text: t("Отмена", "Bekor"), style: "cancel" },
    ]);
  };

  const captureGPS = async () => {
    setGpsLoading(true);
    try {
      const Location = await import("expo-location");

      // Check permission first
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status === "undetermined") {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") {
        notify.error(t("Разрешение на геолокацию не выдано. Разрешите в настройках.", "Joylashuvga ruxsat berilmagan. Sozlamalardan ruxsat bering."));
        setGpsLoading(false);
        return;
      }

      // Get position with timeout
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("GPS timeout")), 15_000)
        ),
      ]);

      if (!pos?.coords) {
        notify.error(t("Не удалось определить координаты", "Koordinatalar aniqlanmadi"));
        setGpsLoading(false);
        return;
      }

      setEditData(d => ({ ...d, gpsLat: pos.coords.latitude.toFixed(8), gpsLng: pos.coords.longitude.toFixed(8) }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Координаты обновлены", "Koordinatalar yangilandi"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (__DEV__) console.warn("[GPS] captureGPS failed:", msg);
      notify.error(t(`Не удалось определить местоположение: ${msg}`, `Joylashuv aniqlanmadi: ${msg}`));
    }
    setGpsLoading(false);
  };

  if (isLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.base, paddingTop: insets.top + Spacing.lg, gap: Spacing.md }}>
      <ShimmerSkeleton height={200} radius={Radii.xl} />
      <ShimmerSkeleton height={60} radius={Radii.xl} />
      <ShimmerSkeleton height={200} radius={Radii.xl} />
    </View>
  );

  if (isError || !shop) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", gap: Spacing.lg, paddingHorizontal: 32 }}>
      <Feather name={isError ? "wifi-off" : "search"} size={32} color={colors.text.muted} />
      <Text style={{ color: colors.text.secondary, fontFamily: Typography.fontMedium, textAlign: "center" }}>
        {isError ? t("Ошибка загрузки", "Yuklashda xato") : t("Магазин не найден", "Do'kon topilmadi")}
      </Text>
      <PressableScale onPress={() => refetch()} haptic="light">
        <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.brand.ink }}>{t("Повторить", "Qayta urinish")}</Text>
        </View>
      </PressableScale>
    </View>
  );

  // After null guard, shop is guaranteed non-null
  const hasDebt = Number(shop.debt ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Hero photo */}
      <TouchableOpacity activeOpacity={0.9} onPress={pickPhoto} disabled={photoMutation.isPending} style={{ height: 200 }}>
        {shop.photoUrl ? (
          <SecureImage uri={shop.photoUrl} style={{ width: "100%", height: "100%", position: "absolute" }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.brand.primary }} />
        )}
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} />
        {photoMutation.isPending && <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" size="large" /></View>}
        {/* Back */}
        <PressableScale onPress={() => router.back()} haptic="light"
          style={{ position: "absolute", top: insets.top + 8, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </PressableScale>
        {/* Edit - only for supervisors/operators */}
        {isSupervisor && (
          <PressableScale onPress={() => { setEditData({}); setEditing(e => !e); }} haptic="light"
            style={{ position: "absolute", top: insets.top + 8, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
            <Feather name={editing ? "x" : "edit-2"} size={18} color="#fff" />
          </PressableScale>
        )}
        {/* Name overlay */}
        <View style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: "#fff" }}>{shop.name}</Text>
          {(shop.city || shop.district) && (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
              {[shop.city, shop.district].filter(Boolean).join(", ")}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* В режиме правки под полями стоят «Сохранить» и «Отмена», и первое
          касание при открытой клавиатуре по умолчанию уходит на её закрытие:
          супервайзер правит адрес, жмёт «Сохранить» — ничего не происходит,
          жмёт снова — сохраняется. Хуже того, второй промах он часто делает
          по «Отмене» рядом и теряет правку целиком. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} tintColor={colors.accent.primary} />}>
        {/* Debt banner */}
        <View style={{
          backgroundColor: hasDebt ? colors.accent.danger + "18" : colors.accent.success + "18",
          borderRadius: Radii.xl, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          ...(hasDebt ? soft(isDark).raisedSm : soft(isDark).inset), marginBottom: 16,
        }}>
          <View>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: hasDebt ? colors.accent.danger : colors.accent.success, marginBottom: 4 }}>
              {hasDebt ? t("ТЕКУЩИЙ ДОЛГ", "JORIY QARZ") : t("ЗАДОЛЖЕННОСТЬ", "QARZ")}
            </Text>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size["2xl"], color: hasDebt ? colors.accent.danger : colors.accent.success }}>
              {formatMoney(shop.debt ?? 0)}
            </Text>
          </View>
          <Feather name={hasDebt ? "alert-circle" : "check-circle"} size={28} color={hasDebt ? colors.accent.danger : colors.accent.success} />
        </View>

        {/* Info card */}
        <FadeInItem delay={0}>
          <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
            {editing ? (
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.accent.primary, letterSpacing: 0.5, marginBottom: 4 }}>{t("РЕДАКТИРОВАНИЕ", "TAHRIRLASH")}</Text>
                {[
                  { key: "name", label: t("Название", "Nomi") }, { key: "ownerName", label: t("Владелец", "Egasi") }, { key: "phone", label: t("Телефон", "Telefon") },
                  { key: "city", label: t("Город", "Shahar") }, { key: "district", label: t("Район", "Tuman") }, { key: "address", label: t("Адрес", "Manzil") },
                  { key: "notes", label: t("Заметки", "Izoh") },
                ].map(f => (
                  <TextInput key={f.key} value={editData[f.key] ?? (shop as unknown as Record<string, string>)[f.key] ?? ""} onChangeText={v => setEditData(d => ({ ...d, [f.key]: v }))}
                    placeholder={f.label} placeholderTextColor={colors.text.tertiary}
                    multiline={f.key === "notes"}
                    numberOfLines={f.key === "notes" ? 3 : 1}
                    textAlignVertical={f.key === "notes" ? "top" : "center"}
                    style={{ backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, ...soft(isDark).inset, minHeight: f.key === "notes" ? 80 : undefined }} />
                ))}
                {/* GPS */}
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>{t("ГЕОЛОКАЦИЯ", "JOYLASHUV")}</Text>
                  <PressableScale onPress={captureGPS} disabled={gpsLoading} haptic="medium"
                    style={{ backgroundColor: (editData.gpsLat || shop.gpsLat) ? colors.accent.success + "15" : colors.bg.input, ...(((editData.gpsLat || shop.gpsLat)) ? soft(isDark).raisedSm : soft(isDark).inset), borderRadius: Radii.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, opacity: gpsLoading ? 0.6 : 1 }}>
                    {gpsLoading ? <ActivityIndicator size="small" color={colors.accent.primary} /> : <Feather name={(editData.gpsLat || shop.gpsLat) ? "check-circle" : "crosshair"} size={16} color={(editData.gpsLat || shop.gpsLat) ? colors.accent.success : colors.accent.primary} />}
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.primary }}>{(editData.gpsLat || shop.gpsLat) ? t("Координаты сохранены", "Koordinatalar saqlandi") : t("Определить местоположение", "Joylashuvni aniqlash")}</Text>
                  </PressableScale>
                </View>
                {/* Territory */}
                {territories.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>{t("ТЕРРИТОРИЯ", "TERRITORIYA")}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <TouchableOpacity onPress={() => setTerritoryId(undefined)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, ...((!territoryId) ? soft(isDark).raisedSm : soft(isDark).inset), backgroundColor: !territoryId ? colors.accent.primary + "15" : colors.bg.input }}>
                        <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: !territoryId ? colors.accent.primary : colors.text.secondary }}>{t("Без территории", "Territoriyasiz")}</Text>
                      </TouchableOpacity>
                      {territories.map((ter: Territory) => (
                        <TouchableOpacity key={ter.id} onPress={() => setTerritoryId(ter.id)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, ...((territoryId === ter.id) ? soft(isDark).raisedSm : soft(isDark).inset), backgroundColor: territoryId === ter.id ? colors.accent.primary + "15" : colors.bg.input }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ter.color || colors.accent.primary }} />
                          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: territoryId === ter.id ? colors.accent.primary : colors.text.secondary }}>{ter.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button variant="primary" size="md" fullWidth loading={updateMutation.isPending}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); updateMutation.mutate(editData as Record<string, string>); }}>
                    {t("Сохранить", "Saqlash")}
                  </Button>
                  <Button variant="secondary" size="md" fullWidth
                    onPress={() => { Haptics.selectionAsync(); setEditing(false); }}>
                    {t("Отмена", "Bekor")}
                  </Button>
                </View>
              </View>
            ) : (
              <>
                {shop.ownerName && <InfoRow icon="user" label={t("Владелец", "Egasi")} value={shop.ownerName} />}
                {shop.phone && <InfoRow icon="phone" label={t("Телефон", "Telefon")} value={shop.phone} onPress={() => Linking.openURL(`tel:${shop.phone}`)} />}
                {shop.address && <InfoRow icon="map-pin" label={t("Адрес", "Manzil")} value={shop.address} />}
                {shop.city && <InfoRow icon="navigation" label={t("Город", "Shahar")} value={[shop.city, shop.district].filter(Boolean).join(", ")} />}
                {shop.gpsLat && shop.gpsLng && <InfoRow icon="crosshair" label={t("Геолокация", "Joylashuv")} value={`${Number(shop.gpsLat).toFixed(6)}, ${Number(shop.gpsLng).toFixed(6)}`} />}
                {shop.notes && <InfoRow icon="file-text" label={t("Заметки", "Izoh")} value={shop.notes} />}
              </>
            )}
          </Card>
        </FadeInItem>

        {/* Status */}
        <FadeInItem delay={40}>
          <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>{t("Статус", "Holat")}</Text>
            <Badge variant={shop.status === "active" ? "success" : "default"}>
              {shop.status === "active" ? t("Активен", "Faol") : t("Неактивен", "Faol emas")}
            </Badge>
          </Card>
        </FadeInItem>

        {/* Quick order button */}
        {shop.status === "active" && (
          <FadeInItem delay={60}>
            <PressableScale
              onPress={() => router.push({ pathname: "/order/new", params: { shopId: id, shopName: shop.name } })}
              haptic="medium"
              style={{ borderRadius: Radii.xl, overflow: "hidden", marginTop: 4 }}
            >
              <View style={{ backgroundColor: colors.brand.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, paddingHorizontal: 20, borderRadius: Radii.xl }}>
                <Feather name="shopping-cart" size={20} color={colors.brand.ink} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.brand.ink }}>{t("Новый заказ", "Yangi buyurtma")}</Text>
              </View>
            </PressableScale>
          </FadeInItem>
        )}
      </ScrollView>
    </View>
  );
}
