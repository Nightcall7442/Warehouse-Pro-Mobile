// Warehouse Pro — Merchandiser Visit Report (matches web MerchandiserVisit.tsx)
import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { getProducts, submitVisitReport, uploadFile, type Product } from "../../src/api";
import { notify } from "../../src/store/toast";

interface ChecklistItem {
  productId: number;
  productName: string;
  present: boolean;
  price?: string;
  promoNote?: string;
}

// ── CardDots (matches web) ───────────────────────────────────────────────────
function CardDots() {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f06895" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#f5a825" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2ec4b0" }} />
    </View>
  );
}

export default function MerchandiserVisitScreen() {
  const { planId, shopId, shopName } = useLocalSearchParams<{ planId: string; shopId: string; shopName: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  const [photos, setPhotos] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [competitorNotes, setCompetitorNotes] = useState("");

  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  useEffect(() => {
    if (products && checklist.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChecklist(products.map((p: Product) => ({ productId: p.id, productName: p.name, present: false })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const submitReport = useMutation({
    mutationFn: () => submitVisitReport({ planId: Number(planId), shopId: Number(shopId), photos, checklist, competitorNotes: competitorNotes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); notify.success("Отчёт отправлен!"); router.back(); },
    onError: (e: Error) => notify.error(e.message),
  });

  const [uploading, setUploading] = useState(false);

  const pickPhoto = async (useCamera: boolean) => {
    const permMethod = useCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const perm = await permMethod();
    if (!perm.granted) { notify.error("Нет доступа"); return; }
    const launchMethod = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchMethod({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setUploading(true);
      try {
        const url = await uploadFile(`data:image/jpeg;base64,${result.assets[0].base64}`, "visits");
        setPhotos(prev => [...prev, url]);
      } catch { notify.error("Ошибка загрузки фото"); }
      finally { setUploading(false); }
    }
  };

  const removePhoto = (index: number) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPhotos(prev => prev.filter((_, i) => i !== index)); };
  const toggleChecklist = (productId: number) => { Haptics.selectionAsync(); setChecklist(prev => prev.map(item => item.productId === productId ? { ...item, present: !item.present } : item)); };
  const updatePrice = (productId: number, price: string) => setChecklist(prev => prev.map(item => item.productId === productId ? { ...item, price } : item));
  const updatePromo = (productId: number, promoNote: string) => setChecklist(prev => prev.map(item => item.productId === productId ? { ...item, promoNote } : item));

  const presentCount = checklist.filter(i => i.present).length;
  const totalItems = checklist.length;
  const completionPct = totalItems > 0 ? Math.round((presentCount / totalItems) * 100) : 0;

  if (productsLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color={colors.accent.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border.default, shadowColor: sc, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Feather name="arrow-left" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <CardDots />
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>Отчёт о визите</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>{shopName}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 100 }}>
        {/* Photos */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)", padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Feather name="camera" size={18} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Фотографии</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {photos.map((photo, i) => (
              <View key={i} style={{ width: 80, height: 80, borderRadius: Radii.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border.default }}>
                <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} />
                <TouchableOpacity onPress={() => removePhoto(i)} style={{ position: "absolute", top: 4, right: 4, backgroundColor: colors.status.danger, borderRadius: 10, padding: 2 }}>
                  <Feather name="x" size={10} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => Alert.alert("Добавить фото", "", [{ text: "Камера", onPress: () => pickPhoto(true) }, { text: "Галерея", onPress: () => pickPhoto(false) }, { text: "Отмена", style: "cancel" }])}
              style={{ width: 80, height: 80, borderRadius: Radii.md, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border.strong, alignItems: "center", justifyContent: "center" }}>
              <Feather name="camera" size={22} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Checklist */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)", padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="check-square" size={18} color={colors.accent.primary} />
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Чек-лист</Text>
            </View>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>{presentCount}/{totalItems} ({completionPct}%)</Text>
          </View>
          {/* Progress */}
          <View style={{ height: 5, backgroundColor: colors.bg.elevated, borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 3, width: `${completionPct}%`, backgroundColor: completionPct === 100 ? colors.status.success : colors.accent.primary }} />
          </View>
          {/* Items */}
          {checklist.map((item) => (
            <Animated.View key={item.productId} entering={FadeIn}>
              <TouchableOpacity onPress={() => toggleChecklist(item.productId)}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: item.present ? colors.accent.primary + "10" : "transparent", borderRadius: Radii.md, marginBottom: 4 }}>
                {/* Checkbox */}
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: item.present ? colors.accent.primary : colors.border.strong, alignItems: "center", justifyContent: "center", marginRight: 12, backgroundColor: item.present ? colors.accent.primary : "transparent" }}>
                  {item.present && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: item.present ? colors.text.primary : colors.text.secondary }}>{item.productName}</Text>
                {/* Price */}
                <TextInput value={item.price ?? ""} onChangeText={(v) => updatePrice(item.productId, v)} placeholder="Цена" keyboardType="numeric"
                  style={{ width: 60, textAlign: "right", fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.primary, backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingHorizontal: 6, paddingVertical: 4, marginRight: 4 }} />
                {/* Promo */}
                <TextInput value={item.promoNote ?? ""} onChangeText={(v) => updatePromo(item.productId, v)} placeholder="Акция"
                  style={{ width: 70, fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.primary, backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingHorizontal: 6, paddingVertical: 4 }} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* Competitor Notes */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)", padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Feather name="message-square" size={18} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Заметки о конкурентах</Text>
          </View>
          <TextInput value={competitorNotes} onChangeText={setCompetitorNotes} multiline numberOfLines={4} placeholder="Что видно на полках конкурентов..."
            style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.primary, textAlignVertical: "top", minHeight: 100 }} />
        </View>
      </ScrollView>

      {/* Submit */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + 16, paddingTop: 12, backgroundColor: colors.bg.primary, borderTopWidth: 1, borderTopColor: colors.border.default }}>
        <TouchableOpacity onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Alert.alert("Завершить визит?", "Отчёт будет отправлен", [{ text: "Отмена", style: "cancel" }, { text: "Отправить", onPress: () => submitReport.mutate() }]);
        }} disabled={submitReport.isPending}
          style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: submitReport.isPending ? 0.6 : 1 }}>
          {submitReport.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={18} color="#fff" />}
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>Завершить визит</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
