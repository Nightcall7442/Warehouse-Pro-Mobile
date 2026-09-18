import { useCallback, useEffect, useState } from "react";
import { View, Text, Alert, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useLockStore } from "../store/lock";
import { useAuthStore } from "../store/auth";
import { useThemeColors } from "../store/theme";
import { Typography, Spacing } from "../theme";
import { Button } from "./ui";
import { useT } from "../i18n";

/**
 * Экран поверх приложения, когда сессия заперта по простою.
 *
 * Существует потому, что «запереть» и «выйти» раньше были одним действием:
 * любая неудача подтверждения стирала токен, и агент возвращался к форме входа
 * с паролем. Здесь сессия остаётся нетронутой — закрыто только содержимое, и
 * попытку можно повторять сколько нужно.
 *
 * Выход тоже есть, но отдельной кнопкой и с подтверждением: он уместен, когда
 * телефон передают другому человеку, и неуместен как последствие неудачно
 * приложенного пальца.
 */
export function LockScreen() {
  const locked = useLockStore((s) => s.locked);
  const unlock = useLockStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const colors = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("Подтвердите, что это вы", "Bu siz ekaningizni tasdiqlang"),
        // Раньше здесь стояло «Выйти», и человек, желавший просто закрыть окно,
        // сам выбирал выход из аккаунта. Отмена должна называться отменой.
        cancelLabel: t("Отмена", "Bekor"),
        disableDeviceFallback: false,
      });
      if (result.success) {
        setHint(null);
        unlock();
        return;
      }
      // Разные причины — разные подсказки. Ни одна из них не повод стирать сессию.
      const err = (result as { error?: string }).error;
      setHint(
        err === "lockout" || err === "lockout_permanent"
          ? t("Слишком много попыток. Подождите немного или войдите заново.", "Urinishlar ko'p bo'ldi. Biroz kuting yoki qaytadan kiring.")
          : err === "not_enrolled" || err === "not_available"
            ? t("Отпечаток или код устройства сейчас недоступны. Можно выйти и войти по паролю.", "Barmoq izi yoki qurilma kodi hozir ishlamayapti. Chiqib, parol bilan kirish mumkin.")
            : t("Не подтвердилось. Попробуйте ещё раз.", "Tasdiqlanmadi. Yana urinib ko'ring."),
      );
    } catch {
      setHint(t("Не удалось запросить подтверждение. Попробуйте ещё раз.", "Tasdiqlash so'rovi yuborilmadi. Yana urinib ko'ring."));
    } finally {
      setBusy(false);
    }
  }, [unlock, t]);

  // Первая попытка сразу при появлении экрана — чтобы в обычном случае человек
  // приложил палец и не увидел ничего лишнего.
  //
  // Через таймер, а не прямо в теле эффекта: authenticate() первым делом
  // ставит состояние, а синхронный setState внутри эффекта вызывает лишний
  // каскад отрисовок. Отложить полезно и по существу — оверлей успевает
  // нарисоваться до того, как поверх него всплывёт системный запрос отпечатка.
  useEffect(() => {
    if (!locked) return;
    const id = setTimeout(() => { void authenticate(); }, 0);
    return () => clearTimeout(id);
  }, [locked, authenticate]);

  const confirmLogout = () => {
    Alert.alert(t("Выйти из аккаунта?", "Hisobdan chiqilsinmi?"), t("Несинхронизированные заказы останутся в очереди и уйдут, когда вы войдёте снова.", "Yuborilmagan buyurtmalar navbatda qoladi va qayta kirganingizda ketadi."), [
      { text: t("Отмена", "Bekor"), style: "cancel" },
      {
        text: t("Выйти", "Chiqish"),
        style: "destructive",
        onPress: () => {
          void logout().then(unlock);
        },
      },
    ]);
  };

  if (!locked) return null;

  /*
    Замок — в собственном системном окне (Modal), а не в оверлее JS-дерева.

    Абсолютный View с zIndex накрывал только экраны навигатора: RN Modal —
    отдельное окно системы и рисуется поверх любого JS-оверлея. Открытый лист
    товара с ценами и остатком или окно доставки так и стояли поверх «замка».
    Смысл замка — скрыть содержимое; своё окно выше всех остальных.
  */
  return (
    <Modal visible transparent={false} animationType="none" statusBarTranslucent onRequestClose={() => { /* «назад» замок не снимает — только отпечаток или выход */ }}>
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.primary,
        alignItems: "center",
        justifyContent: "center",
        padding: Spacing.base * 1.5,
      }}
    >
      <View style={{
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: colors.brand.primaryDim,
        alignItems: "center", justifyContent: "center",
        marginBottom: Spacing.base * 1.5,
      }}>
        <Feather name="lock" size={38} color={colors.brand.primary} />
      </View>

      <Text style={{
        fontFamily: Typography.fontBold, fontSize: Typography.size.xl,
        color: colors.text.primary, textAlign: "center", marginBottom: 8,
      }}>
        {t("Приложение заперто", "Ilova qulflangan")}
      </Text>

      <Text style={{
        fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
        color: colors.text.secondary, textAlign: "center", marginBottom: Spacing.base * 1.5,
        maxWidth: 320, lineHeight: 22,
      }}>
        {hint ?? t("Подтвердите, что телефон у вас, — и вернётесь туда же, где остановились.", "Telefon sizda ekanini tasdiqlang — to'xtagan joyingizga qaytasiz.")}
      </Text>

      <Button variant="primary" size="lg" fullWidth loading={busy} onPress={() => void authenticate()}>
        {t("Разблокировать", "Qulfni ochish")}
      </Button>

      <View style={{ height: Spacing.base }} />

      <Button variant="ghost" size="md" fullWidth onPress={confirmLogout}>
        {t("Выйти из аккаунта", "Hisobdan chiqish")}
      </Button>
    </View>
    </Modal>
  );
}
