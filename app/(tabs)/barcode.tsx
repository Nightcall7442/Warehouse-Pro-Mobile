import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii, ThemeColors } from "../../src/theme";
import { findByBarcode } from "../../src/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";


const DEFAULT_SCAN_SIZE = 250;

export default function BarcodeScannerScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [foundProduct, setFoundProduct] = useState<{ id: number; code: string; name: string; unitPrice: string; unit: string; available: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const styles = makeStyles(colors);

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
        Alert.alert("Товар не найден", `Штрих-код: ${data}`, [
          { text: "OK", onPress: () => setScanned(false) },
        ]);
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
    router.push({
      pathname: "/order/new",
      params: { productId: String(foundProduct.id), productName: foundProduct.name, productPrice: foundProduct.unitPrice },
    });
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Feather name="camera" size={48} color={colors.text.muted} />
        <Text style={{ fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 16, fontFamily: Typography.fontMedium }}>
          Нет доступа к камере
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={styles.permitBtn}
        >
          <Text style={styles.permitBtnText}>Разрешить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Назад">
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Сканировать</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Scan area */}
        <View style={styles.scanArea}>
          <View style={[styles.scanFrame, { width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7 }]}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Scan line animation */}
            {!scanned && (
              <View style={styles.scanLine} />
            )}
          </View>
          <Text style={styles.scanHint}>
            {scanned ? "Обработка..." : "Наведите камеру на штрих-код"}
          </Text>
        </View>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {searching ? (
            <View style={styles.loadingBox}>
              <View style={styles.loadingSpinner} />
              <Text style={styles.loadingText}>Поиск товара...</Text>
            </View>
          ) : foundProduct ? (
            <View style={styles.productCard}>
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={1}>{foundProduct.name}</Text>
                <Text style={styles.productPrice}>{foundProduct.unitPrice} сум/{foundProduct.unit === "pcs" ? "шт" : "кг"}</Text>
                {foundProduct.available && (
                  <Text style={styles.productStock}>Остаток: {Number(foundProduct.available).toFixed(0)} {foundProduct.unit === "pcs" ? "шт" : "кг"}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addToCart(); }} style={styles.addBtn} accessibilityLabel="Добавить в корзину">
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setScanned(false); }} style={styles.retryBtn} accessibilityLabel="Сканировать снова">
              <Feather name="refresh-cw" size={18} color="#fff" />
              <Text style={styles.retryText}>Сканировать снова</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg.overlay,
      alignItems: "center", justifyContent: "center",
    },
    topTitle: { color: "#fff", fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold },
    scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
    scanFrame: {
      width: DEFAULT_SCAN_SIZE, height: DEFAULT_SCAN_SIZE, borderWidth: 2,
      borderColor: "rgba(255,255,255,0.6)", borderRadius: Radii.xl,
    },
    corner: {
      position: "absolute", width: 30, height: 30, borderColor: "#fff", borderWidth: 3,
    },
    cornerTL: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: Radii.xl },
    cornerTR: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: Radii.xl },
    cornerBL: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: Radii.xl },
    cornerBR: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: Radii.xl },
    scanLine: {
      width: "80%", height: 2, backgroundColor: colors.accent.primary, borderRadius: 1,
      position: "absolute", top: "50%", alignSelf: "center",
    },
    scanHint: { color: "rgba(255,255,255,0.8)", fontSize: Typography.size.base, marginTop: 20 },
    bottomBar: { padding: 20, paddingBottom: 32 },
    loadingBox: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 12, paddingVertical: 20, borderRadius: Radii.lg,
      backgroundColor: colors.bg.overlay,
    },
    loadingSpinner: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 3,
      borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff",
    },
    loadingText: { color: "#fff", fontSize: Typography.size.md },
    productCard: {
      flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
      borderRadius: Radii.lg, backgroundColor: colors.bg.card,
      shadowColor: colors.text.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24,
    },
    productInfo: { flex: 1 },
    productName: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary },
    productPrice: { fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.brand.primaryLight, marginTop: 2 },
    productStock: { fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 },
    addBtn: {
      width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accent.primary,
      alignItems: "center", justifyContent: "center",
      shadowColor: colors.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
    },
    retryBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 14, borderRadius: Radii.lg,
      backgroundColor: colors.bg.overlay,
    },
    retryText: { color: "#fff", fontSize: Typography.size.md, fontFamily: Typography.fontMedium },
    permitBtn: {
      marginTop: 16, paddingVertical: 12, paddingHorizontal: 24,
      borderRadius: Radii.md, backgroundColor: colors.accent.primary,
    },
    permitBtnText: {
      color: "#fff", fontFamily: Typography.fontSemibold,
    },
  });
}
