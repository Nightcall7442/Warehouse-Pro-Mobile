import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../src/store/theme";
import { Typography, Spacing, Radii, Sizes } from "../src/theme";
import { Card, EmptyState } from "../src/components/ui";
import { getMySalary, getMyPayouts, confirmPayout, type MyPayout } from "../src/api";
import { useAuthStore } from "../src/store/auth";
import { formatMoney } from "../src/store/branding";
import { errorText } from "../src/lib/error-text";
import { notify } from "../src/store/toast";
import * as Haptics from "expo-haptics";
import { useLang, useT } from "../src/i18n";

/**
 * Моя зарплата.
 *
 * ── Зачем экран ─────────────────────────────────────────────────────────────
 *
 * Зарплату получают агенты и курьеры, то есть ровно те, у кого веба нет
 * вовсе, — а посмотреть её на телефоне было негде. В `plan.tsx` стоял блок
 * «Зарплата», но `kpi.agentKpi` этого поля не возвращает, и блок не рисовался
 * никогда: число существовало только на экране начальника.
 *
 * Здесь оно показано целиком и разложено. Разложение — не украшение: человек,
 * получающий деньги, должен пересчитать их в уме, иначе спор «мне
 * недоплатили» разрешать нечем.
 *
 * ── Подтверждение получения ─────────────────────────────────────────────────
 *
 * Просьба арендатора: «сотрудник получает уведомление и подтверждение о
 * получении». Уведомление приходит толчком при выдаче, подтверждают здесь —
 * рядом с расчётом, из которого сумма сложилась.
 *
 * Подтверждение не меняет НИЧЕГО в деньгах: ни суммы, ни остатка, ни расходов
 * организации. Деньги ушли из кассы в момент выдачи, и ставить это в
 * зависимость от того, открыл ли человек телефон, нельзя. Поэтому
 * «не подтверждено» — спокойное состояние, без красного.
 */

export default function SalaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const t = useT();
  const PERIODS = [
    { key: "month" as const, label: t("Месяц", "Oy") },
    { key: "week" as const, label: t("Неделя", "Hafta") },
    { key: "quarter" as const, label: t("Квартал", "Chorak") },
  ];
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const [refreshing, setRefreshing] = useState(false);

  const isCourier = user?.role === "courier";

  const salaryQ = useQuery({
    queryKey: ["mySalary", period],
    queryFn: () => getMySalary(period),
    retry: false,
  });

  /*
    Выданное — всегда за месяц, каким бы ни был выбранный период расчёта.

    Деньги отдают помесячно, и «выплаты за неделю» отвечали бы на вопрос,
    которого никто не задаёт: человек смотрит сюда, чтобы понять, отдали ему
    за этот месяц или нет.
  */
  const payoutsQ = useQuery({
    queryKey: ["myPayouts"],
    queryFn: () => getMyPayouts("month"),
    retry: false,
  });

  const confirm = useMutation({
    mutationFn: (id: number) => confirmPayout(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify.success(t("Получение подтверждено", "Olinganligi tasdiqlandi"));
      qc.invalidateQueries({ queryKey: ["myPayouts"] });
    },
    onError: (e) => notify.error(errorText(e)),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([salaryQ.refetch(), payoutsQ.refetch()]); }
    finally { setRefreshing(false); }
  }, [salaryQ, payoutsQ]);

  const salary = salaryQ.data;
  const payouts = payoutsQ.data ?? [];
  const paid = payouts.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const due = Math.max(0, (salary?.totalSalary ?? 0) - paid);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* ── Шапка ────────────────────────────────────────────────────── */}
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderColor: colors.border.default,
        flexDirection: "row", alignItems: "center", gap: Spacing.md,
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("Назад", "Orqaga")}
          style={{ width: 36, height: 36, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card }}
        >
          <Feather name="arrow-left" size={18} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>{t("Моя зарплата", "Mening oyligim")}</Text>
          {salary?.period ? (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
              {salary.period}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
      >
        {/* ── Период ─────────────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: Radii.lg, alignItems: "center",
                  backgroundColor: active ? colors.brand.primary : colors.bg.card,
                }}
              >
                <Text style={{
                  fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm,
                  color: active ? colors.brand.ink : colors.text.secondary,
                }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {salaryQ.isLoading ? (
          <Card><ActivityIndicator color={colors.brand.primary} /></Card>
        ) : salaryQ.isError ? (
          <Card>
            <EmptyState icon="alert-circle" title={t("Не удалось загрузить зарплату", "Oylikni yuklab bo'lmadi")} description={errorText(salaryQ.error)} />
          </Card>
        ) : salary ? (
          <>
            {/* ── Итог ─────────────────────────────────────────────── */}
            <Card>
              <Text style={{
                fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
                letterSpacing: Typography.letterSpacing.wider, textTransform: "uppercase",
                color: colors.text.secondary,
              }}>
                {t("Начислено за период", "Davr uchun hisoblangan")}
              </Text>
              <Text style={{
                fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxxl,
                color: colors.text.primary, marginTop: 4,
              }}>
                {formatMoney(salary.totalSalary)}
              </Text>

              {/*
                Выданное и остаток — рядом с начисленным, потому что вопрос у
                человека один: «сколько мне ещё отдадут». Два числа порознь на
                него не отвечают.
              */}
              <View style={{
                flexDirection: "row", gap: Spacing.lg, marginTop: Spacing.lg,
                paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle,
              }}>
                {period === "month" ? (
                  <>
                    <Money label={t("Выдано", "Berilgan")} value={paid} colors={colors} />
                    <Money label={t("Остаток", "Qoldiq")} value={due} colors={colors} accent={due > 0} />
                  </>
                ) : (
                  // Выдачи идут помесячно: «квартал минус выдачи за месяц» — число,
                  // которого никто не должен, и повод для спора «мне недоплатили».
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>
                    {t("Выдано и остаток считаются по месяцу — выберите «Месяц»", "Berilgan va qoldiq oy bo'yicha hisoblanadi — «Oy»ni tanlang")}
                  </Text>
                )}
              </View>
            </Card>

            {/* ── Из чего сложилось ────────────────────────────────── */}
            <Card>
              <Text style={{
                fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
                letterSpacing: Typography.letterSpacing.wider, textTransform: "uppercase",
                color: colors.text.secondary, marginBottom: Spacing.md,
              }}>
                {t("Из чего сложилось", "Nimadan tashkil topgan")}
              </Text>

              <Line label={t("Оклад", "Maosh")} value={formatMoney(salary.baseSalary)} colors={colors} />

              {isCourier ? (
                <>
                  {/*
                    Школьное умножение, а не одна сумма: «12 × 15 000» человек
                    проверяет в уме, а «180 000» — нет.
                  */}
                  <Line
                    label={salary.courierPayMode === "percent" ? t("Сумма довезённого × процент", "Yetkazilgan summa × foiz") : t("Довезено × ставка", "Yetkazildi × stavka")}
                    note={salary.courierPayMode === "percent"
                      ? `${formatMoney(salary.deliveredAmount)} × ${salary.commissionRate}%`
                      : `${salary.deliveredCount} × ${formatMoney(salary.deliveryRate)}`}
                    value={formatMoney(salary.deliveryPay)}
                    colors={colors}
                  />
                  {salary.allowancePay > 0 && (
                    <Line
                      label={t("Обед и дорожные", "Tushlik va yo'l")}
                      note={t(`${salary.workDays} раб. дн. × ${formatMoney(salary.mealAllowance + salary.travelAllowance)}`, `${salary.workDays} ish kuni × ${formatMoney(salary.mealAllowance + salary.travelAllowance)}`)}
                      value={formatMoney(salary.allowancePay)}
                      colors={colors}
                    />
                  )}
                </>
              ) : (
                <>
                  <Line
                    label={t("Комиссия", "Komissiya")}
                    /*
                      Как только у товаров появляются свои проценты, «продажи ×
                      процент» перестаёт сходиться с суммой, и человек читает
                      расхождение как ошибку. Поэтому при исключениях
                      показывается ЧТО произошло, а не выдуманное умножение.
                    */
                    note={salary.productRateCount > 0
                      ? t(`по ${salary.productRateCount} товарам свой процент`, `${salary.productRateCount} ta tovarda o'z foizi`)
                      : `${formatMoney(salary.salesAmount)} × ${salary.commissionRate}%`}
                    value={formatMoney(salary.commissionAmount)}
                    colors={colors}
                  />
                  {salary.breakdown.fraudDeduction < 0 && (
                    <Line
                      label={t("Вычет за подозрительные визиты", "Shubhali tashriflar uchun ushlanma")}
                      value={formatMoney(salary.breakdown.fraudDeduction)}
                      colors={colors}
                      danger
                    />
                  )}
                </>
              )}

              <View style={{
                flexDirection: "row", justifyContent: "space-between",
                paddingTop: Spacing.md, marginTop: Spacing.xs,
                borderTopWidth: 1, borderTopColor: colors.border.subtle,
              }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{t("ИТОГО", "JAMI")}</Text>
                <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.lg, color: colors.status.success }}>
                  {formatMoney(salary.totalSalary)}
                </Text>
              </View>
            </Card>
          </>
        ) : null}

        {/* ── Что уже отдали на руки ───────────────────────────────── */}
        <Card>
          <Text style={{
            fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
            letterSpacing: Typography.letterSpacing.wider, textTransform: "uppercase",
            color: colors.text.secondary, marginBottom: Spacing.md,
          }}>
            {t("Выдано на руки за месяц", "Oy davomida qo'lga berilgan")}
          </Text>

          {payoutsQ.isLoading ? (
            <ActivityIndicator color={colors.brand.primary} />
          ) : payouts.length === 0 ? (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>
              {t("В этом месяце выдач не было", "Bu oyda to'lovlar bo'lmadi")}
            </Text>
          ) : (
            payouts.map((p) => (
              <PayoutRow
                key={p.id}
                payout={p}
                colors={colors}
                busy={confirm.isPending && confirm.variables === p.id}
                onConfirm={() => confirm.mutate(p.id)}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function Money({ label, value, colors, accent }: {
  label: string; value: number; colors: ReturnType<typeof useThemeColors>; accent?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{label}</Text>
      <Text style={{
        fontFamily: Typography.fontBold, fontSize: Typography.size.md, marginTop: 2,
        color: accent ? colors.brand.primary : colors.text.primary,
      }}>
        {formatMoney(value)}
      </Text>
    </View>
  );
}

function Line({ label, note, value, colors, danger }: {
  label: string; note?: string; value: string;
  colors: ReturnType<typeof useThemeColors>; danger?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.md, marginBottom: Spacing.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary }}>{label}</Text>
        {note ? (
          <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
            {note}
          </Text>
        ) : null}
      </View>
      <Text style={{
        fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm,
        color: danger ? colors.status.danger : colors.text.primary,
      }}>
        {value}
      </Text>
    </View>
  );
}

function PayoutRow({ payout, colors, busy, onConfirm }: {
  payout: MyPayout;
  colors: ReturnType<typeof useThemeColors>;
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const confirmed = Boolean(payout.confirmedAt);
  const day = payout.paidAt ? new Date(payout.paidAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru-RU") : "—";

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      gap: Spacing.md, paddingVertical: Spacing.sm,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
          {formatMoney(payout.amount)}
        </Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
          {day}
          {/* Аванс выдан до конца периода: показать его как полный расчёт
              значило бы закрыть месяц, который ещё не закрыт. */}
          {payout.kind === "advance" ? t(" · аванс", " · avans") : ""}
          {payout.note ? ` · ${payout.note}` : ""}
        </Text>
      </View>

      {confirmed ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="check-circle" size={15} color={colors.status.success} />
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.status.success }}>
            {t("подтверждено", "tasdiqlandi")}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("Подтвердить получение денег", "Pul olinganini tasdiqlash")}
          style={{
            // Цель касания — в точках, а не «на глаз»: у проекта на это есть
            // своя величина, и 44 — платформенный минимум.
            minHeight: Sizes.touchTarget, paddingHorizontal: Spacing.lg, borderRadius: Radii.lg,
            alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
            backgroundColor: colors.brand.primary, opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={colors.brand.ink} /> : <Feather name="check" size={14} color={colors.brand.ink} />}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.brand.ink }}>
            {t("Получил", "Oldim")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
