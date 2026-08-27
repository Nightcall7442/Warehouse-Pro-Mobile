// Warehouse Pro — Merchandiser Visit Report v2 (cold palette, Card, Badge, Button)
import { memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { View, Text, FlatList, TextInput, ActivityIndicator, Alert, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, safeBottomPadding } from "../../src/theme";
import { getProducts, submitVisitReport, updatePlanStatus, uploadFile, type Product } from "../../src/api";
import { preparePhoto } from "../../src/lib/prepare-photo";
import { notify } from "../../src/store/toast";
import { Card, Badge, Button, IconCircle } from "../../src/components/ui";
import { PressableScale, FadeInItem } from "../../src/components/Animated";

interface ChecklistItem {
  productId: number;
  productName: string;
  present: boolean;
  price?: string;
  promoNote?: string;
}

// ── Draft auto-save ──────────────────────────────────────────────────────────
// A visit report has no offline queue — unlike order creation and delivery
// actions, submitting requires connectivity, and until now a lost connection
// (a shop's basement, a mall) meant the entire checklist and every photo
// (already individually uploaded) were gone the moment the screen unmounted.
// Keyed by planId so switching between plans can't restore the wrong one.
const draftKey = (planId: string) => `visit_draft_${planId}`;

interface VisitDraft {
  photos: string[];
  checklist: ChecklistItem[];
  competitorNotes: string;
  savedAt: number;
}

async function saveVisitDraft(planId: string, draft: Omit<VisitDraft, "savedAt">) {
  try {
    await AsyncStorage.setItem(draftKey(planId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

async function loadVisitDraft(planId: string): Promise<VisitDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(planId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as VisitDraft;
    // Expire after 24 hours — a stale draft is more likely to confuse than help.
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      await AsyncStorage.removeItem(draftKey(planId));
      return null;
    }
    return draft;
  } catch { return null; }
}

async function clearVisitDraft(planId: string) {
  try { await AsyncStorage.removeItem(draftKey(planId)); } catch { /* ignore */ }
}

/** Строка чек-листа: имя товара, галочка «есть на полке», цена и акция. */
interface ChecklistRowData {
  productId: number;
  productName: string;
}

// Строка перерисовывается только когда меняется что-то её собственное.
// Раньше цена и галочка жили в одном массиве на весь чек-лист: каждый символ
// в поле «Цена» пересоздавал массив, и React перерисовывал все строки разом —
// у арендатора с сотнями SKU это два нативных TextInput на строку, и ввод на
// бюджетном Android шёл по букве в секунду.
const ChecklistRow = memo(function ChecklistRow({
  productId, productName, present, price, promoNote, onToggle, onPrice, onPromo,
}: ChecklistRowData & {
  present: boolean;
  price: string;
  promoNote: string;
  onToggle: (productId: number) => void;
  onPrice: (productId: number, value: string) => void;
  onPromo: (productId: number, value: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ backgroundColor: colors.bg.card, paddingHorizontal: Spacing.lg }}>
      <PressableScale onPress={() => onToggle(productId)} haptic="light">
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: present ? colors.accent.primary + "10" : "transparent", borderRadius: Radii.md, marginBottom: 4 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: present ? colors.accent.primary : colors.border.strong, alignItems: "center", justifyContent: "center", marginRight: 12, backgroundColor: present ? colors.accent.primary : "transparent" }}>
            {present && <Feather name="check" size={14} color="#fff" />}
          </View>
          <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: present ? colors.text.primary : colors.text.secondary }}>{productName}</Text>
          <TextInput value={price} onChangeText={v => onPrice(productId, v)} placeholder="Цена" keyboardType="numeric"
            style={{ width: 60, textAlign: "right", fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.primary, backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingHorizontal: 6, paddingVertical: 4, marginRight: 4 }} />
          <TextInput value={promoNote} onChangeText={v => onPromo(productId, v)} placeholder="Акция"
            style={{ width: 70, fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.primary, backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingHorizontal: 6, paddingVertical: 4 }} />
        </View>
      </PressableScale>
    </View>
  );
});

// ── CardDots (matches web) ───────────────────────────────────────────────────
function CardDots() {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.danger }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.warning }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.success }} />
    </View>
  );
}

export default function MerchandiserVisitScreen() {
  const { planId, shopId, shopName } = useLocalSearchParams<{ planId: string; shopId: string; shopName: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();

  const [photos, setPhotos] = useState<string[]>([]);
  // Список товаров и правки по нему держатся раздельно: строки меняются только
  // при загрузке каталога, а нажатия и ввод трогают маленькие Record'ы по
  // productId, а не массив на весь чек-лист.
  const [rows, setRows] = useState<ChecklistRowData[]>([]);
  const [present, setPresent] = useState<Record<number, boolean>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [promos, setPromos] = useState<Record<number, string>>({});
  const [competitorNotes, setCompetitorNotes] = useState("");
  const draftChecked = useRef(false);

  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  useEffect(() => {
    if (!products || rows.length > 0) return;
    const fresh: ChecklistRowData[] = products.map((p: Product) => ({ productId: p.id, productName: p.name }));
    const known = new Set(fresh.map(r => r.productId));
    loadVisitDraft(planId).then(draft => {
      if (draft && (draft.photos.length > 0 || draft.checklist.some(i => i.present) || draft.competitorNotes)) {
        Alert.alert(
          "Продолжить черновик?",
          "Найден незавершённый отчёт по этому визиту — сеть, видимо, прервалась при отправке.",
          [
            { text: "Начать заново", style: "cancel", onPress: () => { setRows(fresh); clearVisitDraft(planId); } },
            { text: "Продолжить", onPress: () => {
              setPhotos(draft.photos);
              // Merge on productId rather than trusting the two lists to line
              // up. Comparing lengths meant that the office adding a single
              // product silently threw away every tick the merchandiser had
              // made — and since photos and notes still came back, nothing on
              // screen suggested the checklist had been reset.
              // Заодно возвращаются цены и заметки об акциях: прежнее слияние
              // переносило только галочки, и всё набранное в полях пропадало.
              const nextPresent: Record<number, boolean> = {};
              const nextPrices: Record<number, string> = {};
              const nextPromos: Record<number, string> = {};
              for (const item of draft.checklist) {
                if (!known.has(item.productId)) continue;
                if (item.present) nextPresent[item.productId] = true;
                if (item.price) nextPrices[item.productId] = item.price;
                if (item.promoNote) nextPromos[item.productId] = item.promoNote;
              }
              setRows(fresh);
              setPresent(nextPresent);
              setPrices(nextPrices);
              setPromos(nextPromos);
              setCompetitorNotes(draft.competitorNotes);
            } },
          ],
        );
      } else {
        setRows(fresh);
      }
      draftChecked.current = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  /** Плоский вид чек-листа — только для отправки и для черновика. */
  const buildChecklist = useCallback((): ChecklistItem[] => rows.map(r => ({
    productId: r.productId,
    productName: r.productName,
    present: present[r.productId] ?? false,
    price: prices[r.productId],
    promoNote: promos[r.productId],
  })), [rows, present, prices, promos]);

  // Auto-save so a killed app or a lost connection doesn't erase the whole
  // checklist and every already-uploaded photo — matches order/new.tsx's draft
  // pattern. Skipped until the initial load/restore above has run, so it can't
  // overwrite a still-unread draft with an empty in-progress state.
  // Плоский чек-лист собирается внутри таймера, а не на каждое нажатие: при
  // сотнях позиций пересборка массива на каждый символ и была той самой
  // задержкой ввода.
  useEffect(() => {
    if (!draftChecked.current || rows.length === 0) return;
    const timer = setTimeout(() => {
      saveVisitDraft(planId, { photos, checklist: buildChecklist(), competitorNotes });
    }, 2000);
    return () => clearTimeout(timer);
  }, [planId, photos, rows, present, prices, promos, competitorNotes, buildChecklist]);

  const submitReport = useMutation({
    mutationFn: () => submitVisitReport({ planId: Number(planId), shopId: Number(shopId), photos, checklist: buildChecklist(), competitorNotes: competitorNotes || undefined }),
    onSuccess: async () => {
      try { await updatePlanStatus(Number(planId), "visited"); } catch { /* plan status update is best-effort */ }
      await clearVisitDraft(planId);
      qc.invalidateQueries({ queryKey: ["plans"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Отчёт отправлен!");
      router.back();
    },
    onError: (e: Error) => notify.error(e.message + " — черновик сохранён, можно повторить попытку."),
  });

  const pickPhoto = async (useCamera: boolean) => {
    const permMethod = useCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const perm = await permMethod();
    if (!perm.granted) { notify.error("Нет доступа"); return; }
    const launchMethod = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    // base64 у камеры больше не запрашивается: он держал бы в памяти лишнюю
    // копию полноразмерного кадра до того момента, как мы его уменьшим.
    const result = await launchMethod({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6 });
    if (!result.canceled && result.assets[0].uri) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        // Снимок уменьшается перед отправкой: камера отдаёт полное
        // разрешение, и без этого кадр весит мегабайты, а часть кадров
        // вовсе не проходит клиентский лимит.
        const { dataUrl } = await preparePhoto(result.assets[0].uri);
        const url = await uploadFile(dataUrl, "visits");
        setPhotos(prev => [...prev, url]);
      } catch (e) { notify.error(e instanceof Error ? e.message : "Ошибка загрузки фото"); }
    }
  };

  const removePhoto = (index: number) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPhotos(prev => prev.filter((_, i) => i !== index)); };
  // Обработчики стабильны по ссылке, иначе memo на строке ничего не даст.
  const toggleChecklist = useCallback((productId: number) => { Haptics.selectionAsync(); setPresent(prev => ({ ...prev, [productId]: !prev[productId] })); }, []);
  const updatePrice = useCallback((productId: number, price: string) => setPrices(prev => ({ ...prev, [productId]: price })), []);
  const updatePromo = useCallback((productId: number, promoNote: string) => setPromos(prev => ({ ...prev, [productId]: promoNote })), []);

  const presentCount = useMemo(() => rows.reduce((n, r) => n + (present[r.productId] ? 1 : 0), 0), [rows, present]);
  const totalItems = rows.length;
  const completionPct = totalItems > 0 ? Math.round((presentCount / totalItems) * 100) : 0;

  if (productsLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color={colors.accent.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
        <PressableScale onPress={() => router.back()} haptic="light">
          <View style={{ padding: 8 }}>
            <Feather name="arrow-left" size={20} color={colors.text.primary} />
          </View>
        </PressableScale>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <CardDots />
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>Отчёт о визите</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>{shopName}</Text>
        </View>
      </View>

      {/* Чек-лист — виртуализованный список, а не .map внутри ScrollView.
          У арендатора с сотнями активных SKU прежняя разметка монтировала все
          строки сразу (по два нативных TextInput на каждую), и экран отчёта
          открывался с многосекундной паузой. Шапка и заметки живут в
          ListHeaderComponent/ListFooterComponent — вкладывать FlatList в
          ScrollView нельзя, виртуализация в нём не работает. */}
      <FlatList
        data={rows}
        keyExtractor={r => String(r.productId)}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        // Состояние строк лежит вне data, поэтому список нужно уведомить явно.
        extraData={{ present, prices, promos }}
        renderItem={({ item }) => (
          <ChecklistRow
            productId={item.productId}
            productName={item.productName}
            present={present[item.productId] ?? false}
            price={prices[item.productId] ?? ""}
            promoNote={promos[item.productId] ?? ""}
            onToggle={toggleChecklist}
            onPrice={updatePrice}
            onPromo={updatePromo}
          />
        )}
        ListHeaderComponent={
      <>
        {/* Photos */}
        <FadeInItem delay={0}>
          <Card style={{ padding: Spacing.lg, marginBottom: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <IconCircle name="camera" size={14} variant="brand" />
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Фотографии</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {photos.map((photo, i) => (
                <View key={i} style={{ width: 80, height: 80, borderRadius: Radii.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border.default }}>
                  <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} />
                  <PressableScale onPress={() => removePhoto(i)} haptic="light">
                    <View style={{ position: "absolute", top: 4, right: 4, backgroundColor: colors.status.danger, borderRadius: 10, padding: 2 }}>
                      <Feather name="x" size={10} color="#fff" />
                    </View>
                  </PressableScale>
                </View>
              ))}
              <PressableScale onPress={() => Alert.alert("Добавить фото", "", [{ text: "Камера", onPress: () => pickPhoto(true) }, { text: "Галерея", onPress: () => pickPhoto(false) }, { text: "Отмена", style: "cancel" }])} haptic="light">
                <View style={{ width: 80, height: 80, borderRadius: Radii.md, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border.strong, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={22} color={colors.text.muted} />
                </View>
              </PressableScale>
            </View>
          </Card>
        </FadeInItem>

        {/* Checklist header — сами строки идёт списком ниже */}
        <FadeInItem delay={40}>
          <Card style={{ padding: Spacing.lg, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconCircle name="check-square" size={14} variant="brand" />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Чек-лист</Text>
              </View>
              <Badge variant={completionPct === 100 ? "success" : "info"}>{presentCount}/{totalItems} ({completionPct}%)</Badge>
            </View>
            {/* Progress */}
            <View style={{ height: 5, backgroundColor: colors.bg.elevated, borderRadius: 3, overflow: "hidden" }}>
              <View style={{ height: "100%", borderRadius: 3, width: `${completionPct}%`, backgroundColor: completionPct === 100 ? colors.status.success : colors.accent.primary }} />
            </View>
          </Card>
        </FadeInItem>
      </>
        }
        ListFooterComponent={
      <>
        {/* Нижняя кромка блока строк — чтобы список читался как одна карточка */}
        <View style={{ height: Spacing.lg, backgroundColor: colors.bg.card, borderBottomLeftRadius: Radii.xxl, borderBottomRightRadius: Radii.xxl, marginBottom: Spacing.md }} />

        {/* Competitor Notes */}
        <FadeInItem delay={80}>
          <Card style={{ padding: Spacing.lg, marginBottom: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <IconCircle name="message-square" size={14} variant="brand" />
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>Заметки о конкурентах</Text>
            </View>
            <TextInput value={competitorNotes} onChangeText={setCompetitorNotes} multiline numberOfLines={4} placeholder="Что видно на полках конкурентов..."
              style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.primary, textAlignVertical: "top", minHeight: 100 }} />
          </Card>
        </FadeInItem>
      </>
        }
      />

      {/* Submit */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.base, paddingBottom: safeBottomPadding(insets.bottom, 16), paddingTop: 12, backgroundColor: colors.bg.primary, borderTopWidth: 1, borderTopColor: colors.border.default }}>
        <Button variant="primary" size="lg" fullWidth icon="send" loading={submitReport.isPending}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Alert.alert("Завершить визит?", "Отчёт будет отправлен", [{ text: "Отмена", style: "cancel" }, { text: "Отправить", onPress: () => submitReport.mutate() }]);
          }}>
          Завершить визит
        </Button>
      </View>
    </View>
  );
}
