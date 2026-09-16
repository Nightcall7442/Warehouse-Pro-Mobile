import { useState } from "react";
import { View, Text, Pressable, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft } from "../../src/theme";
import { Button } from "../../src/components/ui";
import { QueryState } from "../../src/components/QueryState";
import { getOrderReceipt } from "../../src/api";
import { errorText } from "../../src/lib/error-text";
import { notify } from "../../src/store/toast";
import { useT } from "../../src/i18n";

/**
 * Чек.
 *
 * HTML приходит с сервера (там же он печатается в вебе и открывается по QR),
 * телефон его только показывает и раздаёт: PDF в Telegram/WhatsApp магазина,
 * системная печать (58-мм принтер с Android-плагином печати), ссылка текстом.
 * Картинку сам чек не рисует — QR на нём ведёт на ту же продажу из учёта,
 * и это важнее красоты: чек, которого нет по ссылке, — товар мимо учёта.
 */
export default function ReceiptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const { id: idParam, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const id = Number(idParam);
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => getOrderReceipt(id), enabled: Number.isFinite(id) && id > 0, retry: false });
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);

  const sharePdf = async () => {
    if (!q.data) return;
    setBusy("pdf");
    try {
      const { uri } = await Print.printToFileAsync({ html: q.data.html, width: 226, base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: t(`Чек ${q.data.number}`, `Chek ${q.data.number}`) });
      else notify.error(t("На этом устройстве нечем поделиться", "Bu qurilmada ulashish imkoni yo'q"));
    } catch (e) { notify.error(errorText(e)); }
    finally { setBusy(null); }
  };
  const print = async () => {
    if (!q.data) return;
    setBusy("print");
    try { await Print.printAsync({ html: q.data.html, width: 226 }); }
    catch (e) { if (!/cancel/i.test(String(e))) notify.error(errorText(e)); }
    finally { setBusy(null); }
  };
  const shareLink = async () => {
    if (!q.data) return;
    Haptics.selectionAsync().catch(() => {});
    await Share.share({ message: t("Чек", "Chek") + " " + q.data.number + ": " + q.data.url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bg.secondary, flexDirection: "row", alignItems: "center", gap: Spacing.md, ...soft(isDark).raisedSm,
      }}>
        <Pressable onPress={() => (fresh === "1" ? router.replace("/van") : router.back())} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("Назад", "Orqaga")}
          style={{ width: 36, height: 36, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card, ...soft(isDark).raisedSm }}>
          <Feather name="arrow-left" size={18} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{t("Чек", "Chek")} {q.data?.number ?? ""}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>{fresh === "1" ? t("Продажа записана. Отдайте чек магазину.", "Sotuv yozildi. Chekni do'konga bering.") : t("По QR откроется та же продажа из учёта", "QR orqali hisobdagi shu sotuv ochiladi")}</Text>
        </View>
      </View>

      <View style={{ flex: 1, margin: Spacing.lg, borderRadius: Radii.xl, overflow: "hidden", backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
        <QueryState query={q} what={t("чек", "chek")}>
          {q.data && <WebView originWhitelist={["*"]} source={{ html: q.data.html }} style={{ flex: 1, backgroundColor: "transparent" }} scalesPageToFit={false} testID="receipt-webview" />}
        </QueryState>
      </View>

      <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: insets.bottom + Spacing.md, gap: Spacing.sm }}>
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          <Button variant="primary" icon="share-2" style={{ flex: 1 }} loading={busy === "pdf"} disabled={!q.data || busy !== null} onPress={sharePdf}>{t("Отправить PDF", "PDF yuborish")}</Button>
          <Button variant="secondary" icon="printer" style={{ flex: 1 }} loading={busy === "print"} disabled={!q.data || busy !== null} onPress={print}>{t("Печать", "Chop etish")}</Button>
        </View>
        <Button variant="ghost" icon="link" fullWidth disabled={!q.data} onPress={shareLink}>{t("Ссылка на чек", "Chek havolasi")}</Button>
      </View>
    </View>
  );
}
