// Warehouse Pro — Barcode Scanner v2 (cold palette, Card, PressableScale)
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii, safeBottomPadding } from "../../src/theme";
import { findByBarcode } from "../../src/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../src/components/ui";
import { PressableScale } from "../../src/components/Animated";
import * as Haptics from "expo-haptics";
import { formatMoney } from "../../src/store/branding";
import { unitShort } from "../../src/lib/units";
import { readableInk } from "../../src/lib/contrast";

export default function BarcodeScannerScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [foundProduct, setFoundProduct] = useState<{ id: number; code: string; name: string; unitPrice: string; unit: string; available: string | null } | null>(null);
  const [searching, setSearching] = useState(false);

  // Чернила на кнопках, залитых цветом арендатора. Белый литерал поверх такой
  // заливки — ошибка: у светлого бренда «Заказать этот товар» пропадала совсем,
  // а это единственная кнопка, ради которой сюда приходят. Надписи поверх
  // камеры остаются белыми — там фон затемнение, а не бренд.
  const actionInk = readableInk(colors.accent.primary);

  /*
    Камера живёт только пока экран открыт.

    Сканер — вкладка, а вкладки expo-router не размонтируются: после
    router.back() предпросмотр оставался включённым до перезапуска приложения.
    Пока агент работает в других разделах, камера продолжает потреблять
    батарею — а телефон нужен ему до вечера.
  */
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSearching(true);
    try {
      const product = await findByBarcode(data);
      if (product) {
        setFoundProduct(product);
      } else {
        Alert.alert("Товар не найден", `Штрих-код: ${data}`, [{ text: "OK", onPress: () => setScanned(false) }]);
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось найти товар");
      setScanned(false);
    } finally {
      setSearching(false);
    }
  };

  const addToCart = () => {
    if (!foundProduct) return;
    router.push({ pathname: "/order/new", params: { productId: String(foundProduct.id), productName: foundProduct.name, productPrice: foundProduct.unitPrice } });
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.bg.primary }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Feather name="camera" size={48} color={colors.text.muted} />
        <Text style={{ fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 16, fontFamily: Typography.fontMedium }}>Нет доступа к камере</Text>
        <PressableScale onPress={requestPermission} haptic="medium">
          <View style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radii.md, backgroundColor: colors.accent.primary }}>
            <Text style={{ color: actionInk, fontFamily: Typography.fontSemibold }}>Разрешить</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {focused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] }}
        />
      )}

      {/* Overlay */}
      <View style={[StyleSheet.absoluteFill, { justifyContent: "space-between" }]}>
        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <PressableScale onPress={() => router.back()} haptic="light">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg.overlay, alignItems: "center", justifyContent: "center" }}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </View>
          </PressableScale>
          <Text style={{ color: "#fff", fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>Сканировать</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Scan area */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", borderRadius: Radii.xl }}>
            {/* Corner markers */}
            <View style={{ position: "absolute", top: -2, left: -2, width: 30, height: 30, borderColor: "#fff", borderWidth: 3, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: Radii.xl }} />
            <View style={{ position: "absolute", top: -2, right: -2, width: 30, height: 30, borderColor: "#fff", borderWidth: 3, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: Radii.xl }} />
            <View style={{ position: "absolute", bottom: -2, left: -2, width: 30, height: 30, borderColor: "#fff", borderWidth: 3, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: Radii.xl }} />
            <View style={{ position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderColor: "#fff", borderWidth: 3, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: Radii.xl }} />
            {/* Scan line */}
            {!scanned && <View style={{ width: "80%", height: 2, backgroundColor: colors.accent.primary, borderRadius: 1, position: "absolute", top: "50%", alignSelf: "center" }} />}
          </View>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: Typography.size.base, marginTop: 20 }}>
            {scanned ? "Обработка..." : "Наведите камеру на штрих-код"}
          </Text>
        </View>

        {/* Нижняя панель.
            Стояло paddingBottom: 32 числом. На Android с полосой жестов или
            тремя кнопками системная панель занимает у нижнего края 24–48
            точек, а поверх экрана ещё висит плавающий таб-бар приложения — он
            абсолютный и места в разметке не занимает. Кнопка «Заказать этот
            товар» лежала под ними и не нажималась. */}
        <View style={{ padding: 20, paddingBottom: safeBottomPadding(insets.bottom, 20) }}>
          {searching ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 20, borderRadius: Radii.lg, backgroundColor: colors.bg.overlay }}>
              {/* Было кольцо из View с borderTopColor, но вращения ему никто не
                  задавал: агент видел застывшее колечко и надпись «Поиск
                  товара...» — экран выглядел зависшим, и он начинал тыкать в
                  камеру повторно. */}
              <ActivityIndicator size="small" color="#fff" />
              <Text style={{ color: "#fff", fontSize: Typography.size.md }}>Поиск товара...</Text>
            </View>
          ) : foundProduct ? (
            /* Единица берётся из общего справочника. Раньше она выбиралась
               двоичной проверкой: «pcs» — «шт», всё остальное — «кг». Литры,
               метры, ящики, упаковки и блоки (пять кодов из семи) получали
               чужую подпись: агент наводил камеру на ящик, читал «1 200 сум/кг»
               и «Остаток: 40 кг» — и называл магазину цену за килограмм там,
               где она за ящик. */
            <View style={{ gap: 10 }}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary }} numberOfLines={1}>{foundProduct.name}</Text>
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.accent.primary, marginTop: 2 }}>{formatMoney(foundProduct.unitPrice)}/{unitShort(foundProduct.unit)}</Text>
                  {foundProduct.available && (
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 }}>Остаток: {Number(foundProduct.available).toFixed(0)} {unitShort(foundProduct.unit)}</Text>
                  )}
                </View>
                <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addToCart(); }} haptic="medium">
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="plus" size={20} color={actionInk} />
                  </View>
                </PressableScale>
              </Card>
              <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addToCart(); }} haptic="medium">
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: Radii.lg, backgroundColor: colors.accent.primary }}>
                  <Feather name="shopping-cart" size={18} color={actionInk} />
                  <Text style={{ color: actionInk, fontSize: Typography.size.md, fontFamily: Typography.fontSemibold }}>Заказать этот товар</Text>
                </View>
              </PressableScale>
            </View>
          ) : (
            <PressableScale onPress={() => { Haptics.selectionAsync(); setScanned(false); }} haptic="light">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: Radii.lg, backgroundColor: colors.bg.overlay }}>
                <Feather name="refresh-cw" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontSize: Typography.size.md, fontFamily: Typography.fontMedium }}>Сканировать снова</Text>
              </View>
            </PressableScale>
          )}
        </View>
      </View>
    </View>
  );
}
