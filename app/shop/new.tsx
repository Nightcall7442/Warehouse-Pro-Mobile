// Warehouse Pro — New Shop v2 (cold palette, Card, Button, PressableScale)
import React, { useState, useRef } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { preparePhoto } from "../../src/lib/prepare-photo";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Radii, ThemeColors, safeBottomPadding, soft } from "../../src/theme";
import { Card, Button } from "../../src/components/ui";
import { createShop, uploadFile, getTerritories, Territory } from "../../src/api";
import { uuidv4, isRetryableError } from "../../src/store/offline";
import { useShopQueue } from "../../src/store/shop-queue";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { PressableScale, FadeInItem } from "../../src/components/Animated";
import { useT } from "../../src/i18n";

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: ThemeColors }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.secondary, marginBottom: 6, letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}

export default function NewShopScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  // Снимок, который не удалось загрузить без связи: файл на телефоне, уйдёт вместе с магазином.
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const shownPhoto = photo ?? localPhoto;
  const [gpsLat, setGpsLat] = useState<string | null>(null);
  const [gpsLng, setGpsLng] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [territoryId, setTerritoryId] = useState<number | undefined>(undefined);

  const { data: territories = [] } = useQuery({ queryKey: ["territories"], queryFn: getTerritories });

  const inputStyle = {
    backgroundColor: colors.bg.input, ...soft(isDark).inset,
    borderRadius: Radii.md, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
    color: colors.text.primary,
  };

  const PICKER_OPTS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6 };

  const uploadPicked = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets[0]?.uri) return;
    try {
        // Снимок уменьшается перед отправкой: камера отдаёт полное
        // разрешение, и без этого кадр весит мегабайты, а часть кадров
        // вовсе не проходит клиентский лимит.
      const { dataUrl } = await preparePhoto(res.assets[0].uri);
      const url = await uploadFile(dataUrl, "shops");
      setPhoto(url);
      setLocalPhoto(null);
    } catch (e) {
      // Без связи снимок не выбрасывается: остаётся файлом и уйдёт с магазином.
      if (isRetryableError(e)) {
        setLocalPhoto(res.assets[0].uri);
        setPhoto(null);
        notify.info(t("Нет связи — фото осталось на телефоне и уйдёт вместе с магазином", "Aloqa yo'q — rasm telefonda qoldi va do'kon bilan birga yuboriladi"));
        return;
      }
      notify.error(e instanceof Error ? e.message : t("Ошибка загрузки", "Yuklashda xato"));
    }
  };

  const takePhoto = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) { notify.error(t("Нет доступа к камере", "Kameraga ruxsat yo'q")); return; }
    await uploadPicked(await ImagePicker.launchCameraAsync(PICKER_OPTS));
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify.error(t("Нет доступа к галерее", "Galereyaga ruxsat yo'q")); return; }
    await uploadPicked(await ImagePicker.launchImageLibraryAsync(PICKER_OPTS));
  };

  /**
   * Ask which source to use, camera first.
   *
   * This used to open the gallery and only fall back to the camera when
   * gallery permission was *denied* — so the one case it couldn't serve was
   * the main one: an agent standing in front of a new shop, wanting to
   * photograph it. The picture doesn't exist yet; there is nothing in the
   * gallery to choose.
   */
  const pickPhoto = () => {
    Alert.alert(t("Фото магазина", "Do'kon rasmi"), undefined, [
      { text: t("Сделать фото", "Rasmga olish"), onPress: () => { void takePhoto(); } },
      { text: t("Выбрать из галереи", "Galereyadan tanlash"), onPress: () => { void pickFromLibrary(); } },
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

      setGpsLat(pos.coords.latitude.toFixed(8));
      setGpsLng(pos.coords.longitude.toFixed(8));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Координаты сохранены", "Koordinatalar saqlandi"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (__DEV__) console.warn("[GPS] captureGPS failed:", msg);
      notify.error(t(`Не удалось определить местоположение: ${msg}`, `Joylashuv aniqlanmadi: ${msg}`));
    }
    setGpsLoading(false);
  };

  /**
   * Метка попытки, одна на всё время заполнения формы.
   *
   * Генерируется при открытии экрана и НЕ меняется между нажатиями «Создать».
   * В этом весь смысл: если первый запрос дошёл до сервера и магазин создался,
   * а ответ потерялся, повтор придёт с тем же ключом — сервер узнает его и
   * вернёт уже созданный магазин вместо второго. Ключ, сгенерированный на
   * каждый запрос, не защищал бы ни от чего.
   *
   * useRef, а не useState: значение не влияет на отрисовку, а пересоздавать его
   * при каждом рендере нельзя.
   */
  const idempotencyKeyRef = useRef(uuidv4());
  // Снимок с телефона, загруженный при «Создать»: сорвётся само создание — в
  // очередь уйдёт уже ссылка, и файл не погонят по слабой связи второй раз.
  const uploadedRef = useRef<string | null>(null);
  const shopInput = () => ({ name, ownerName: owner || undefined, phone: phone || undefined, city: city || undefined, district: district || undefined, address: address || undefined, notes: notes || undefined, photoUrl: photo || uploadedRef.current || undefined, gpsLat: gpsLat || undefined, gpsLng: gpsLng || undefined, territoryId, idempotencyKey: idempotencyKeyRef.current });

  const mutation = useMutation({
    mutationFn: async () => {
      const input = shopInput();
      if (!input.photoUrl && localPhoto) {
        input.photoUrl = uploadedRef.current = await uploadFile((await preparePhoto(localPhoto)).dataUrl, "shops");
      }
      return createShop(input);
    },
    // "shops" and "availableShops" are two different endpoints (the latter
    // backs the shop picker in order creation and the catalog screen) — only
    // invalidating "shops" left a just-created shop missing from both until a
    // manual refresh or app restart.
    onSuccess: (res) => {
      // Следующий магазин — новая попытка, и ключ ему нужен свой. Без этого
      // экран, открытый повторно без размонтирования, отправил бы второй
      // магазин под ключом первого и получил бы в ответ первый.
      idempotencyKeyRef.current = uuidv4();
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["availableShops"] });
      router.back();
      // Повтор после оборванной связи — не ошибка и не второй магазин.
      notify.success(res?.idempotent ? t("Магазин уже был создан", "Do'kon allaqachon yaratilgan") : t("Магазин создан", "Do'kon yaratildi"));
    },
    onError: async (e: Error) => {
      /*
        Связи нет — магазин ложится в очередь (store/shop-queue) с тем же
        ключом попытки: дошёл ли первый запрос, сервер узнает по ключу. Раньше
        здесь было «Нажмите «Создать» ещё раз», а заказ на новую точку без
        связи оформить было нельзя вовсе.
      */
      if (isRetryableError(e)) {
        const input = shopInput();
        const saved = await useShopQueue.getState().add(input, input.photoUrl ? undefined : localPhoto ?? undefined);
        if (saved) {
          router.back();
          notify.info(t("Нет связи — магазин сохранён на телефоне и уйдёт сам. Заказ на него можно оформить уже сейчас.", "Aloqa yo'q — do'kon telefonda saqlandi va o'zi yuboriladi. Unga buyurtmani hozir rasmiylashtirish mumkin."));
          return;
        }
        // Не записалось на диск (нет места) — форма остаётся, и сказано это окном, а не тостом.
        Alert.alert(
          t("Магазин НЕ сохранён", "Do'kon SAQLANMADI"),
          t("На телефоне нет места. Освободите место и нажмите «Создать» ещё раз — повтор не создаст второй магазин.", "Telefonda joy yo'q. Joy bo'shating va «Yaratish»ni yana bosing — ikkinchi do'kon yaratilmaydi."),
        );
        return;
      }
      notify.error(e.message || t("Не удалось создать магазин", "Do'kon yaratilmadi"));
    },
  });

  /**
   * Уход с формы с вопросом, если в ней что-то есть.
   *
   * Считается заполненным всё, что человек внёс руками, и снятая точка GPS:
   * её получают, стоя у витрины, и потерять её обиднее прочего.
   */
  const hasInput =
    Boolean(name || owner || phone || city || district || address || notes || shownPhoto || gpsLat);

  function requestClose() {
    if (!hasInput) {
      router.back();
      return;
    }
    Alert.alert(
      t("Выйти без сохранения?", "Saqlamasdan chiqilsinmi?"),
      t("Заполненное пропадёт.", "Kiritilganlar yo'qoladi."),
      [
        { text: t("Остаться", "Qolish"), style: "cancel" },
        { text: t("Выйти", "Chiqish"), style: "destructive", onPress: () => router.back() },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header gradient */}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: colors.bg.secondary, ...soft(isDark).raisedSm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {/* Крестик стирал заполненную анкету без единого вопроса.
              Магазин заводят при живом разговоре с владельцем: название,
              хозяин, телефон, город, район, адрес, фото витрины, координаты.
              Одно нажатие — и всё заново, вместе с уже снятой точкой GPS. */}
          <TouchableOpacity
            onPress={requestClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.card, ...soft(isDark).raisedSm, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="x" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.text.primary }}>{t("Новый магазин", "Yangi do'kon")}</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: safeBottomPadding(insets.bottom, 32) }} showsVerticalScrollIndicator={false}>
        <FadeInItem delay={0}>
        {/* Photo */}
        <PressableScale onPress={pickPhoto} haptic="light">
          <Card style={{ width: "100%", height: 160, overflow: "hidden", marginBottom: 20, ...(shownPhoto ? soft(isDark).raisedSm : soft(isDark).inset), borderStyle: "dashed", padding: 0 }}>
            {shownPhoto ? (
              <Image source={{ uri: shownPhoto }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent.primary + "22", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={26} color={colors.accent.primary} />
                </View>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary }}>{t("Добавить фото", "Rasm qo'shish")}</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.secondary, textAlign: "center" }}>{t("Чтобы доставщики не потерялись", "Kuryerlar adashmasligi uchun")}</Text>
              </View>
            )}
          </Card>
        </PressableScale>

        {shownPhoto && (
          <TouchableOpacity onPress={() => { setPhoto(null); setLocalPhoto(null); }}
            style={{ alignSelf: "center", marginTop: -12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.status.dangerDim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full }}>
            <Feather name="trash-2" size={13} color={colors.status.danger} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.status.danger }}>{t("Удалить фото", "Rasmni o'chirish")}</Text>
          </TouchableOpacity>
        )}

        <Field label={t("Название магазина *", "Do'kon nomi *")} colors={colors}>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder={t("Продукты 24", "Oziq-ovqat 24")} placeholderTextColor={colors.text.tertiary} />
        </Field>
        <Field label={t("Владелец", "Egasi")} colors={colors}>
          <TextInput style={inputStyle} value={owner} onChangeText={setOwner} placeholder={t("Имя владельца", "Egasining ismi")} placeholderTextColor={colors.text.tertiary} />
        </Field>
        <Field label={t("Телефон", "Telefon")} colors={colors}>
          <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+998901234567" keyboardType="phone-pad" placeholderTextColor={colors.text.tertiary} />
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label={t("Город", "Shahar")} colors={colors}><TextInput style={inputStyle} value={city} onChangeText={setCity} placeholder={t("Ургенч", "Urganch")} placeholderTextColor={colors.text.tertiary} /></Field></View>
          <View style={{ flex: 1 }}><Field label={t("Район", "Tuman")} colors={colors}><TextInput style={inputStyle} value={district} onChangeText={setDistrict} placeholder={t("Центр", "Markaz")} placeholderTextColor={colors.text.tertiary} /></Field></View>
        </View>
        <Field label={t("Адрес", "Manzil")} colors={colors}>
          <TextInput style={inputStyle} value={address} onChangeText={setAddress} placeholder={t("ул. Ал-Хорезми, 12", "Al-Xorazmiy ko'chasi, 12")} placeholderTextColor={colors.text.tertiary} />
        </Field>
        {territories.length > 0 && (
          <Field label={t("Территория", "Territoriya")} colors={colors}>
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
          </Field>
        )}
        <Field label={t("Заметки", "Izoh")} colors={colors}>
          <TextInput style={[inputStyle, { height: 80, textAlignVertical: "top" }]} multiline value={notes} onChangeText={setNotes} placeholder={t("Дополнительная информация…", "Qo'shimcha ma'lumot…")} placeholderTextColor={colors.text.tertiary} />
        </Field>

        {/* GPS */}
        <Field label={t("Геолокация (опционально)", "Joylashuv (ixtiyoriy)")} colors={colors}>
          <PressableScale onPress={captureGPS} disabled={gpsLoading} haptic="medium"
            style={{ backgroundColor: gpsLat ? colors.accent.success + "15" : colors.bg.input, ...(gpsLat ? soft(isDark).raisedSm : soft(isDark).inset), borderRadius: Radii.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, opacity: gpsLoading ? 0.6 : 1 }}>
            {gpsLoading ? <ActivityIndicator size="small" color={colors.accent.primary} /> : <Feather name={gpsLat ? "check-circle" : "crosshair"} size={16} color={gpsLat ? colors.accent.success : colors.accent.primary} />}
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.primary }}>{gpsLat ? t("Координаты сохранены", "Koordinatalar saqlandi") : t("Определить местоположение", "Joylashuvni aniqlash")}</Text>
          </PressableScale>
          {gpsLat && gpsLng && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.secondary, marginTop: 6 }}>{gpsLat}, {gpsLng}</Text>}
        </Field>

        {/* Submit */}
        <Button variant="primary" size="lg" fullWidth loading={mutation.isPending} disabled={mutation.isPending || !name.trim()}
          onPress={() => { if (!name.trim()) { notify.error(t("Введите название", "Nom kiriting")); return; } Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); mutation.mutate(); }}>
          {t("Создать магазин", "Do'kon yaratish")}
        </Button>
        </FadeInItem>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
