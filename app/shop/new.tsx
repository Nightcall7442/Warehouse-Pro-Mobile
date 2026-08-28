// Warehouse Pro — New Shop v2 (cold palette, Card, Button, PressableScale)
import React, { useState, useRef } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { preparePhoto } from "../../src/lib/prepare-photo";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii, Gradients, ThemeColors, safeBottomPadding } from "../../src/theme";
import { Card, Button } from "../../src/components/ui";
import { createShop, uploadFile, getTerritories, Territory } from "../../src/api";
import { uuidv4 } from "../../src/store/offline";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { PressableScale, FadeInItem } from "../../src/components/Animated";

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
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState<string | null>(null);
  const [gpsLng, setGpsLng] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [territoryId, setTerritoryId] = useState<number | undefined>(undefined);

  const { data: territories = [] } = useQuery({ queryKey: ["territories"], queryFn: getTerritories });

  const inputStyle = {
    backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.border.default,
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
    } catch (e) { notify.error(e instanceof Error ? e.message : "Ошибка загрузки"); }
  };

  const takePhoto = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) { notify.error("Нет доступа к камере"); return; }
    await uploadPicked(await ImagePicker.launchCameraAsync(PICKER_OPTS));
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify.error("Нет доступа к галерее"); return; }
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
    Alert.alert("Фото магазина", undefined, [
      { text: "Сделать фото", onPress: () => { void takePhoto(); } },
      { text: "Выбрать из галереи", onPress: () => { void pickFromLibrary(); } },
      { text: "Отмена", style: "cancel" },
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

      setGpsLat(pos.coords.latitude.toFixed(8));
      setGpsLng(pos.coords.longitude.toFixed(8));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Координаты сохранены");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (__DEV__) console.warn("[GPS] captureGPS failed:", msg);
      notify.error(`Не удалось определить местоположение: ${msg}`);
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

  const mutation = useMutation({
    mutationFn: () => createShop({ name, ownerName: owner || undefined, phone: phone || undefined, city: city || undefined, district: district || undefined, address: address || undefined, notes: notes || undefined, photoUrl: photo || undefined, gpsLat: gpsLat || undefined, gpsLng: gpsLng || undefined, territoryId, idempotencyKey: idempotencyKeyRef.current }),
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
      notify.success(res?.idempotent ? "Магазин уже был создан" : "Магазин создан");
    },
    onError: (e: Error) => {
      // "timeout of 15000ms exceeded" агенту не говорит ничего, а нажать кнопку
      // ещё раз предлагает прямо. Теперь повтор безопасен — тот же ключ вернёт
      // тот же магазин, — но сказать об этом надо человеческими словами.
      const msg = e.message ?? "";
      const network = /timeout|network|econn|aborted/i.test(msg);
      notify.error(network
        ? "Связь пропала. Нажмите «Создать» ещё раз — повтор не создаст второй магазин."
        : msg || "Не удалось создать магазин");
    },
  });

  /**
   * Уход с формы с вопросом, если в ней что-то есть.
   *
   * Считается заполненным всё, что человек внёс руками, и снятая точка GPS:
   * её получают, стоя у витрины, и потерять её обиднее прочего.
   */
  const hasInput =
    Boolean(name || owner || phone || city || district || address || notes || photo || gpsLat);

  function requestClose() {
    if (!hasInput) {
      router.back();
      return;
    }
    Alert.alert(
      "Выйти без сохранения?",
      "Заполненное пропадёт.",
      [
        { text: "Остаться", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => router.back() },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header gradient */}
      <LinearGradient colors={Gradients.primary} style={{ paddingTop: insets.top + 12, paddingBottom: 20, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {/* Крестик стирал заполненную анкету без единого вопроса.
              Магазин заводят при живом разговоре с владельцем: название,
              хозяин, телефон, город, район, адрес, фото витрины, координаты.
              Одно нажатие — и всё заново, вместе с уже снятой точкой GPS. */}
          <TouchableOpacity
            onPress={requestClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: "#fff" }}>Новый магазин</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: safeBottomPadding(insets.bottom, 32) }} showsVerticalScrollIndicator={false}>
        <FadeInItem delay={0}>
        {/* Photo */}
        <PressableScale onPress={pickPhoto} haptic="light">
          <Card style={{ width: "100%", height: 160, overflow: "hidden", marginBottom: 20, borderWidth: 2, borderColor: photo ? "transparent" : colors.border.default, borderStyle: "dashed", padding: 0 }}>
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent.primary + "22", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={26} color={colors.accent.primary} />
                </View>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary }}>Добавить фото</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.secondary, textAlign: "center" }}>Чтобы доставщики не потерялись</Text>
              </View>
            )}
          </Card>
        </PressableScale>

        {photo && (
          <TouchableOpacity onPress={() => setPhoto(null)}
            style={{ alignSelf: "center", marginTop: -12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.status.dangerDim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full }}>
            <Feather name="trash-2" size={13} color={colors.status.danger} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.status.danger }}>Удалить фото</Text>
          </TouchableOpacity>
        )}

        <Field label="Название магазина *" colors={colors}>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Продукты 24" placeholderTextColor={colors.text.tertiary} />
        </Field>
        <Field label="Владелец" colors={colors}>
          <TextInput style={inputStyle} value={owner} onChangeText={setOwner} placeholder="Имя владельца" placeholderTextColor={colors.text.tertiary} />
        </Field>
        <Field label="Телефон" colors={colors}>
          <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+998901234567" keyboardType="phone-pad" placeholderTextColor={colors.text.tertiary} />
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Город" colors={colors}><TextInput style={inputStyle} value={city} onChangeText={setCity} placeholder="Ургенч" placeholderTextColor={colors.text.tertiary} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Район" colors={colors}><TextInput style={inputStyle} value={district} onChangeText={setDistrict} placeholder="Центр" placeholderTextColor={colors.text.tertiary} /></Field></View>
        </View>
        <Field label="Адрес" colors={colors}>
          <TextInput style={inputStyle} value={address} onChangeText={setAddress} placeholder="ул. Ал-Хорезми, 12" placeholderTextColor={colors.text.tertiary} />
        </Field>
        {territories.length > 0 && (
          <Field label="Территория" colors={colors}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity onPress={() => setTerritoryId(undefined)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, borderWidth: 1, borderColor: !territoryId ? colors.accent.primary : colors.border.default, backgroundColor: !territoryId ? colors.accent.primary + "15" : colors.bg.input }}>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: !territoryId ? colors.accent.primary : colors.text.secondary }}>Без территории</Text>
              </TouchableOpacity>
              {territories.map((ter: Territory) => (
                <TouchableOpacity key={ter.id} onPress={() => setTerritoryId(ter.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, borderWidth: 1, borderColor: territoryId === ter.id ? colors.accent.primary : colors.border.default, backgroundColor: territoryId === ter.id ? colors.accent.primary + "15" : colors.bg.input }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ter.color || colors.accent.primary }} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: territoryId === ter.id ? colors.accent.primary : colors.text.secondary }}>{ter.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}
        <Field label="Заметки" colors={colors}>
          <TextInput style={[inputStyle, { height: 80, textAlignVertical: "top" }]} multiline value={notes} onChangeText={setNotes} placeholder="Дополнительная информация…" placeholderTextColor={colors.text.tertiary} />
        </Field>

        {/* GPS */}
        <Field label="Геолокация (опционально)" colors={colors}>
          <PressableScale onPress={captureGPS} disabled={gpsLoading} haptic="medium"
            style={{ backgroundColor: gpsLat ? colors.accent.success + "15" : colors.bg.input, borderWidth: 1, borderColor: gpsLat ? colors.accent.success : colors.border.default, borderRadius: Radii.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, opacity: gpsLoading ? 0.6 : 1 }}>
            {gpsLoading ? <ActivityIndicator size="small" color={colors.accent.primary} /> : <Feather name={gpsLat ? "check-circle" : "crosshair"} size={16} color={gpsLat ? colors.accent.success : colors.accent.primary} />}
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.primary }}>{gpsLat ? "Координаты сохранены" : "Определить местоположение"}</Text>
          </PressableScale>
          {gpsLat && gpsLng && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.secondary, marginTop: 6 }}>{gpsLat}, {gpsLng}</Text>}
        </Field>

        {/* Submit */}
        <Button variant="primary" size="lg" fullWidth loading={mutation.isPending} disabled={mutation.isPending || !name.trim()}
          onPress={() => { if (!name.trim()) { notify.error("Введите название"); return; } Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); mutation.mutate(); }}>
          Создать магазин
        </Button>
        </FadeInItem>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
