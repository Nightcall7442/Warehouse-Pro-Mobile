// Warehouse Pro — New Shop v2 (cold palette, Card, Button, PressableScale)
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { notify } from "../../src/store/toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Radii, Gradients, ThemeColors } from "../../src/theme";
import { Card, Button } from "../../src/components/ui";
import { createShop, uploadFile } from "../../src/api";
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

  const inputStyle = {
    backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: Radii.md, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
    color: colors.text.primary,
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { const cam = await ImagePicker.requestCameraPermissionsAsync(); if (!cam.granted) { notify.error("Нет доступа"); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
      if (!res.canceled && res.assets[0].base64) {
        try { const url = await uploadFile(`data:image/jpeg;base64,${res.assets[0].base64}`, "shops"); setPhoto(url); }
        catch { notify.error("Ошибка загрузки"); }
      }
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.6, base64: true });
    if (!res.canceled && res.assets[0].base64) {
      try { const url = await uploadFile(`data:image/jpeg;base64,${res.assets[0].base64}`, "shops"); setPhoto(url); }
      catch { notify.error("Ошибка загрузки"); }
    }
  };

  const captureGPS = async () => {
    setGpsLoading(true);
    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { notify.error("Разрешение не выдано"); setGpsLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGpsLat(pos.coords.latitude.toFixed(8));
      setGpsLng(pos.coords.longitude.toFixed(8));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Координаты сохранены");
    } catch { notify.error("Не удалось определить местоположение"); }
    setGpsLoading(false);
  };

  const mutation = useMutation({
    mutationFn: () => createShop({ name, ownerName: owner || undefined, phone: phone || undefined, city: city || undefined, district: district || undefined, address: address || undefined, notes: notes || undefined, photoUrl: photo || undefined, gpsLat: gpsLat || undefined, gpsLng: gpsLng || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shops"] }); router.back(); notify.success("Магазин создан"); },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header gradient */}
      <LinearGradient colors={Gradients.primary} style={{ paddingTop: insets.top + 12, paddingBottom: 20, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: "#fff" }}>Новый магазин</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
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
