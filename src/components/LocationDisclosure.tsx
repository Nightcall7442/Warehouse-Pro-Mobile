import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "../store/theme";
import { Typography, Spacing, Radii, Sizes } from "../theme";

/* ═══════════════════════════════════════════════════════════════════════════
   Предварительное раскрытие: что мы собираем и кто это видит.

   ── Почему это обязательно ──────────────────────────────────────────────────

   Правило Google Play про геолокацию в фоне звучит буквально так: приложение
   обязано показать заметное разъяснение ДО системного запроса разрешения, и
   человек должен согласиться отдельным действием. Приложение, которое сразу
   показывает системное окно, отклоняют — и это не придирка: системное окно
   говорит «разрешить доступ к местоположению», но не говорит, что след будет
   виден начальнику.

   У Apple то же по существу (раздел 5.1.1): назначение сбора объясняется до
   запроса, и объяснение должно быть конкретным.

   ── Почему это правильно и без магазинов ────────────────────────────────────

   Здесь следят за живым человеком на работе. Он имеет право знать до того,
   как нажал: что именно записывается, как часто, кто это увидит и как
   выключить. Экран, который прячет это за словом «Авто-трекинг», обманывает
   его — независимо от того, требует магазин раскрытия или нет.

   ── Что здесь намеренно НЕ сделано ──────────────────────────────────────────

   Кнопка «Разрешаю» не подсвечена ярче, чем «Не сейчас», и отказ не ведёт ни
   к каким последствиям в приложении. Согласие, вытянутое оформлением, — это
   не согласие, и оно не устоит ни перед проверкой магазина, ни перед
   разговором с человеком, который его дал.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  visible: boolean;
  /** Человек согласился — за этим идёт системный запрос разрешения. */
  onAccept: () => void;
  /** Отказался или закрыл. Трекинг остаётся выключенным. */
  onDecline: () => void;
}

export function LocationDisclosure({ visible, onAccept, onDecline }: Props) {
  const colors = useThemeColors();

  const line = (icon: keyof typeof Feather.glyphMap, text: string) => (
    <View style={{ flexDirection: "row", gap: Spacing.md, alignItems: "flex-start" }}>
      <Feather name={icon} size={16} color={colors.text.tertiary} style={{ marginTop: 2 }} />
      <Text style={{
        flex: 1, fontFamily: Typography.fontRegular,
        fontSize: Typography.size.sm, lineHeight: 20, color: colors.text.secondary,
      }}>
        {text}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
          paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.xl,
          maxHeight: "88%",
        }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: "center", marginBottom: Spacing.lg }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: colors.brand.primaryDim,
                alignItems: "center", justifyContent: "center",
              }}>
                <Feather name="map-pin" size={24} color={colors.brand.primary} />
              </View>
              <Text style={{
                fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xl,
                color: colors.text.primary, marginTop: Spacing.md, textAlign: "center",
              }}>
                Ваше местоположение увидит руководитель
              </Text>
            </View>

            <View style={{ gap: Spacing.md, marginBottom: Spacing.lg }}>
              {line(
                "navigation",
                "Приложение будет записывать, где вы находитесь, — в том числе когда оно свёрнуто или экран выключен.",
              )}
              {line(
                "clock",
                "Точка снимается при перемещении, не чаще одного раза в две минуты. Пока вы стоите на месте, не записывается ничего.",
              )}
              {line(
                "eye",
                "След за рабочий день видят супервайзер и руководитель вашей организации — на карте и в отчётах. Больше он не передаётся никому.",
              )}
              {line(
                "shield",
                "Вместе с точкой отправляется уровень заряда телефона — чтобы в офисе понимали, почему связь пропала.",
              )}
              {line(
                "toggle-left",
                "Выключить можно в любой момент этим же переключателем: запись прекращается сразу.",
              )}
            </View>

            <Text style={{
              fontFamily: Typography.fontRegular, fontSize: Typography.size.xs,
              lineHeight: 18, color: colors.text.tertiary, marginBottom: Spacing.lg,
            }}>
              Данные о местоположении собираются для учёта рабочих визитов и подтверждения
              доставок. Подробнее — в политике конфиденциальности на сайте warehouse-pro.uz.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Разрешаю записывать местоположение"
              onPress={onAccept}
              style={{
                minHeight: Sizes.touchTarget, alignItems: "center", justifyContent: "center",
                borderRadius: Radii.lg, backgroundColor: colors.brand.primary,
                paddingVertical: Spacing.md,
              }}
            >
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: "#fff" }}>
                Разрешаю
              </Text>
            </Pressable>

            {/*
              Отказ такой же по размеру и не выглядит второстепенным: согласие,
              вытянутое оформлением, — не согласие.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Не разрешать запись местоположения"
              onPress={onDecline}
              style={{
                minHeight: Sizes.touchTarget, alignItems: "center", justifyContent: "center",
                marginTop: Spacing.sm, paddingVertical: Spacing.md,
              }}
            >
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>
                Не сейчас
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
