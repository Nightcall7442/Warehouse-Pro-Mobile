// Warehouse Pro — Shop Detail (matches web ShopDetail.tsx)
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, Linking, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, Gradients, Shadows, ThemeColors } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { getShop, getShopForSupervisor, updateShop, uploadShopPhoto, uploadFile } from "../../src/api";
import { PressableScale, ShimmerSkeleton } from "../../src/components/Animated";

function InfoRow({ icon, label, value, onPress, colors, isDark }: { icon: string; label: string; value: string; onPress?: () => void; colors: ThemeColors; isDark: boolean }) {
  const sc = isDark ? DarkShadowColor : Shadows.xs.shadowColor;
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
  const { isDark } = useThemeStore();
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

  const [photoUploading, setPhotoUploading] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify.error("Нет доступа к галерее"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
    if (!res.canceled && res.assets[0].base64) {
      setPhotoUploading(true);
      try {
        const url = await uploadFile(`data:image/jpeg;base64,${res.assets[0].base64}`, "shops");
        photoMutation.mutate(url);
      } catch { notify.error("Ошибка загрузки"); }
      finally { setPhotoUploading(false); }
    }
  };

  const captureGPS = async () => {
    setGpsLoading(true);
    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { notify.error("Разрешение не выдано"); setGpsLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setEditData(d => ({ ...d, gpsLat: pos.coords.latitude.toFixed(8), gpsLng: pos.coords.longitude.toFixed(8) }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Координаты обновлены");
    } catch { notify.error("Не удалось определить местоположение"); }
    setGpsLoading(false);
  };

  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  if (isLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.base, paddingTop: insets.top + Spacing.lg, gap: Spacing.md }}>
      <ShimmerSkeleton height={200} radius={Radii.xl} />
      <ShimmerSkeleton height={60} radius={Radii.xl} />
      <ShimmerSkeleton height={200} radius={Radii.xl} />
    </View>
  );

  if (isError || !shop) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", gap: Spacing.md }}>
      <Feather name="wifi-off" size={32} color={colors.text.muted} />
      <Text style={{ color: colors.text.secondary, fontFamily: Typography.fontMedium }}>Магазин не найден</Text>
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
        {/* Edit */}
        <PressableScale onPress={() => { setEditData({}); setEditing(e => !e); }} haptic="light"
          style={{ position: "absolute", top: insets.top + 8, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
          <Feather name={editing ? "x" : "edit-2"} size={18} color="#fff" />
        </PressableScale>
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
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: colors.border.default, marginBottom: 16, overflow: "hidden", shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation }}>
          {editing ? (
            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: Typography.size.sm, color: colors.accent.primary, letterSpacing: 0.5, marginBottom: 4 }}>РЕДАКТИРОВАНИЕ</Text>
              {[
                { key: "name", label: "Название" }, { key: "ownerName", label: "Владелец" }, { key: "phone", label: "Телефон" },
                { key: "city", label: "Город" }, { key: "district", label: "Район" }, { key: "address", label: "Адрес" },
              ].map(f => (
                <TextInput key={f.key} defaultValue={(shop as unknown as Record<string, string>)[f.key] ?? ""} onChangeText={v => setEditData(d => ({ ...d, [f.key]: v }))}
                  placeholder={f.label} placeholderTextColor={colors.text.tertiary}
                  style={{ backgroundColor: colors.bg.input, borderRadius: Radii.md, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, borderWidth: 1, borderColor: colors.border.default }} />
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
                <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); updateMutation.mutate(editData as Record<string, string>); }} disabled={updateMutation.isPending} haptic="medium"
                  style={{ flex: 1, backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 13, alignItems: "center", opacity: updateMutation.isPending ? 0.6 : 1 }}>
                  {updateMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: Typography.fontBold, color: "#fff" }}>Сохранить</Text>}
                </PressableScale>
                <PressableScale onPress={() => { Haptics.selectionAsync(); setEditing(false); }} haptic="selection"
                  style={{ flex: 1, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, padding: 13, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>Отмена</Text>
                </PressableScale>
              </View>
            </View>
          ) : (
            <>
              {shop.ownerName && <InfoRow icon="user" label="Владелец" value={shop.ownerName} colors={colors} isDark={isDark} />}
              {shop.phone && <InfoRow icon="phone" label="Телефон" value={shop.phone} onPress={() => Linking.openURL(`tel:${shop.phone}`)} colors={colors} isDark={isDark} />}
              {shop.address && <InfoRow icon="map-pin" label="Адрес" value={shop.address} colors={colors} isDark={isDark} />}
              {shop.city && <InfoRow icon="navigation" label="Город" value={[shop.city, shop.district].filter(Boolean).join(", ")} colors={colors} isDark={isDark} />}
              {shop.gpsLat && shop.gpsLng && <InfoRow icon="crosshair" label="Геолокация" value={`${Number(shop.gpsLat).toFixed(6)}, ${Number(shop.gpsLng).toFixed(6)}`} colors={colors} isDark={isDark} />}
              {shop.notes && <InfoRow icon="file-text" label="Заметки" value={shop.notes} colors={colors} isDark={isDark} />}
            </>
          )}
        </View>

        {/* Status */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: colors.border.default, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: sc, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity, shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>Статус</Text>
          <View style={{ backgroundColor: shop.status === "active" ? colors.accent.success + "22" : colors.border.default, paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radii.full }}>
            <Text style={{ fontFamily: Typography.fontSemiBold, fontSize: Typography.size.sm, color: shop.status === "active" ? colors.accent.success : colors.text.secondary }}>
              {shop.status === "active" ? "Активен" : "Неактивен"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
