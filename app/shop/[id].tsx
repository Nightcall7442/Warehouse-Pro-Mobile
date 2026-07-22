// Warehouse Pro — Shop Detail v2 (cold palette, Card, Badge, FadeInItem)
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { getShop, getShopForSupervisor, updateShop, uploadShopPhoto, uploadFile } from "../../src/api";
import { Card, Badge, Button } from "../../src/components/ui";
import { PressableScale, FadeInItem, ShimmerSkeleton } from "../../src/components/Animated";

function InfoRow({ icon, label, value, onPress, colors }: { icon: string; label: string; value: string; onPress?: () => void; colors: ThemeColors }) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.accent.primary + "22", alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon as keyof typeof Feather.glyphMap} size={16} color={colors.accent.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: onPress ? colors.accent.primary : colors.text.primary }}>{value}</Text>
      </View>
      {onPress && <Feather name="chevron-right" size={16} color={colors.accent.primary} />}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity> : content;
}

export default function ShopDetailScreen() {
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

  const { data: shop, isLoading, isError, refetch } = useQuery({
    queryKey: ["shop", id],
    queryFn: () => isSupervisor ? getShopForSupervisor(Number(id)) : getShop(Number(id)),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Record<string, string>>) => updateShop(Number(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop", id] }); qc.invalidateQueries({ queryKey: ["shops"] }); setEditing(false); notify.success("Сохранено"); },
    onError: (e: Error) => notify.error(e.message),
  });

  const photoMutation = useMutation({
    mutationFn: (url: string) => uploadShopPhoto(Number(id), url),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop", id] }); qc.invalidateQueries({ queryKey: ["shops"] }); notify.success("Фото обновлено"); },
    onError: (e: Error) => notify.error(e.message),
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify.error("Нет доступа к галерее"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
    if (!res.canceled && res.assets[0].base64) {
      try {
        const url = await uploadFile(`data:image/jpeg;base64,${res.assets[0].base64}`, "shops");
        photoMutation.mutate(url);
      } catch { notify.error("Ошибка загрузки"); }
    }
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
        notify.error("Разрешение на геолокацию не выдано. Разрешите в настройках.");
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
        notify.error("Не удалось определить координаты");
        setGpsLoading(false);
        return;
      }

      setEditData(d => ({ ...d, gpsLat: pos.coords.latitude.toFixed(8), gpsLng: pos.coords.longitude.toFixed(8) }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Координаты обновлены");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.warn("[GPS] captureGPS failed:", msg);
      notify.error(`Не удалось определить местоположение: ${msg}`);
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

  if (isError || (!shop && !isLoading)) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", gap: Spacing.lg, paddingHorizontal: 32 }}>
      <Feather name={isError ? "wifi-off" : "search"} size={32} color={colors.text.muted} />
      <Text style={{ color: colors.text.secondary, fontFamily: Typography.fontMedium, textAlign: "center" }}>
        {isError ? "Ошибка загрузки" : "Магазин не найден"}
      </Text>
      <PressableScale onPress={() => refetch()} haptic="light">
        <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: "#fff" }}>Повторить</Text>
        </View>
      </PressableScale>
    </View>
  );

  const hasDebt = Number(shop.debt ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Hero photo */}
      <TouchableOpacity activeOpacity={0.9} onPress={pickPhoto} disabled={photoMutation.isPending} style={{ height: 200 }}>
        {shop.photoUrl ? (
          <Image source={{ uri: shop.photoUrl }} style={{ width: "100%", height: "100%", position: "absolute" }} resizeMode="cover" />
        ) : (
          <LinearGradient colors={Gradients.primary} style={{ flex: 1 }} />
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} tintColor={colors.accent.primary} />}>
        {/* Debt banner */}
        <View style={{
          backgroundColor: hasDebt ? colors.accent.danger + "18" : colors.accent.success + "18",
          borderRadius: Radii.xl, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          borderWidth: 1, borderColor: hasDebt ? colors.accent.danger + "40" : colors.accent.success + "40", marginBottom: 16,
        }}>
          <View>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: hasDebt ? colors.accent.danger : colors.accent.success, marginBottom: 4 }}>
              {hasDebt ? "ТЕКУЩИЙ ДОЛГ" : "ЗАДОЛЖЕННОСТЬ"}
            </Text>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size["2xl"], color: hasDebt ? colors.accent.danger : colors.accent.success }}>
              {Number(shop.debt ?? 0).toLocaleString("ru")} сум
            </Text>
          </View>
          <Feather name={hasDebt ? "alert-circle" : "check-circle"} size={28} color={hasDebt ? colors.accent.danger : colors.accent.success} />
        </View>

        {/* Info card */}
        <FadeInItem delay={0}>
          <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
            {editing ? (
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: Typography.size.sm, color: colors.accent.primary, letterSpacing: 0.5, marginBottom: 4 }}>РЕДАКТИРОВАНИЕ</Text>
                {[
                  { key: "name", label: "Название" }, { key: "ownerName", label: "Владелец" }, { key: "phone", label: "Телефон" },
                  { key: "city", label: "Город" }, { key: "district", label: "Район" }, { key: "address", label: "Адрес" },
                  { key: "notes", label: "Заметки" },
                ].map(f => (
                  <TextInput key={f.key} value={editData[f.key] ?? (shop as unknown as Record<string, string>)[f.key] ?? ""} onChangeText={v => setEditData(d => ({ ...d, [f.key]: v }))}
                    placeholder={f.label} placeholderTextColor={colors.text.tertiary}
                    multiline={f.key === "notes"}
                    numberOfLines={f.key === "notes" ? 3 : 1}
                    textAlignVertical={f.key === "notes" ? "top" : "center"}
                    style={{ backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, borderWidth: 1, borderColor: colors.border.default, minHeight: f.key === "notes" ? 80 : undefined }} />
                ))}
                {/* GPS */}
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>ГЕОЛОКАЦИЯ</Text>
                  <PressableScale onPress={captureGPS} disabled={gpsLoading} haptic="medium"
                    style={{ backgroundColor: (editData.gpsLat || shop.gpsLat) ? colors.accent.success + "15" : colors.bg.input, borderWidth: 1, borderColor: (editData.gpsLat || shop.gpsLat) ? colors.accent.success : colors.border.default, borderRadius: Radii.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, opacity: gpsLoading ? 0.6 : 1 }}>
                    {gpsLoading ? <ActivityIndicator size="small" color={colors.accent.primary} /> : <Feather name={(editData.gpsLat || shop.gpsLat) ? "check-circle" : "crosshair"} size={16} color={(editData.gpsLat || shop.gpsLat) ? colors.accent.success : colors.accent.primary} />}
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.primary }}>{(editData.gpsLat || shop.gpsLat) ? "Координаты сохранены" : "Определить местоположение"}</Text>
                  </PressableScale>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button variant="primary" size="md" fullWidth loading={updateMutation.isPending}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); updateMutation.mutate(editData as Record<string, string>); }}>
                    Сохранить
                  </Button>
                  <Button variant="secondary" size="md" fullWidth
                    onPress={() => { Haptics.selectionAsync(); setEditing(false); }}>
                    Отмена
                  </Button>
                </View>
              </View>
            ) : (
              <>
                {shop.ownerName && <InfoRow icon="user" label="Владелец" value={shop.ownerName} colors={colors} />}
                {shop.phone && <InfoRow icon="phone" label="Телефон" value={shop.phone} onPress={() => Linking.openURL(`tel:${shop.phone}`)} colors={colors} />}
                {shop.address && <InfoRow icon="map-pin" label="Адрес" value={shop.address} colors={colors} />}
                {shop.city && <InfoRow icon="navigation" label="Город" value={[shop.city, shop.district].filter(Boolean).join(", ")} colors={colors} />}
                {shop.gpsLat && shop.gpsLng && <InfoRow icon="crosshair" label="Геолокация" value={`${Number(shop.gpsLat).toFixed(6)}, ${Number(shop.gpsLng).toFixed(6)}`} colors={colors} />}
                {shop.notes && <InfoRow icon="file-text" label="Заметки" value={shop.notes} colors={colors} />}
              </>
            )}
          </Card>
        </FadeInItem>

        {/* Status */}
        <FadeInItem delay={40}>
          <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>Статус</Text>
            <Badge variant={shop.status === "active" ? "success" : "default"}>
              {shop.status === "active" ? "Активен" : "Неактивен"}
            </Badge>
          </Card>
        </FadeInItem>
      </ScrollView>
    </View>
  );
}
