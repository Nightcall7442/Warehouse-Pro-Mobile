import { useState, useMemo } from "react";
import { View, Text, ScrollView, TextInput } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  createPlans,
  getAgentsList,
  getAllShops,
  ShopSummary,
} from "../../api";
import { notify } from "../../store/toast";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { Typography, Spacing, Radii, soft } from "../../theme";
import { Button } from "../ui";
import { ShimmerSkeleton } from "../Animated";
import { BottomSheet, SelectRow, FieldLabel } from "./PlanHelpers";
import { useT } from "../../i18n";

export function CreatePlanModal({
  visible,
  date,
  onClose,
  onCreated,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onCreated: (agentId?: number) => void;
}) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [selectedTerritory, setSelectedTerritory] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const t = useT();

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agentsList"],
    queryFn: getAgentsList,
    enabled: visible,
  });
  const { data: allShops, isLoading: shopsLoading } = useQuery({
    queryKey: ["allShops"],
    queryFn: getAllShops,
    enabled: visible,
  });

  const territories = useMemo(() => {
    if (!allShops) return [];
    const map = new Map<string, ShopSummary[]>();
    for (const shop of allShops) {
      const territory = shop.district || shop.city || t("Без территории", "Territoriyasiz");
      if (!map.has(territory)) map.set(territory, []);
      map.get(territory)!.push(shop);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([territory, shops]) => ({ territory, shops, count: shops.length }));
  }, [allShops, t]);

  const selectedShops = useMemo(() => {
    if (!selectedTerritory) return [];
    return territories.find(terr => terr.territory === selectedTerritory)?.shops ?? [];
  }, [territories, selectedTerritory]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agentId || !selectedShops.length) return;
      // Один запрос на территорию вместо цикла по магазинам: см. createPlans.
      return createPlans({
        agentId,
        shopIds: selectedShops.map(shop => shop.id),
        planDate: date,
        notes: notes || undefined,
      });
    },
    onSuccess: (result) => {
      // Показываем, что записалось на самом деле. Раньше здесь стояло число
      // выбранных магазинов — оно оставалось верным, только пока ни один из них
      // не был назначен ранее.
      notify.success(
        result && result.skipped > 0
          ? t(`Создано ${result.created}, уже были: ${result.skipped}`, `Yaratildi: ${result.created}, avval bor edi: ${result.skipped}`)
          : t(`Создано ${result?.created ?? 0} планов`, `${result?.created ?? 0} ta reja yaratildi`),
      );
      const createdAgent = agentId ?? undefined;
      reset();
      onCreated(createdAgent);
    },
    onError: (e: Error) => notify.error(e.message ?? t("Не удалось создать планы", "Rejalarni yaratib bo'lmadi")),
  });

  function reset() {
    setAgentId(null);
    setSelectedTerritory(null);
    setNotes("");
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={reset} title={t("Новый план визита", "Yangi tashrif rejasi")} colors={colors}>
      {/* Под полем примечания стоит «Создать план»: без этого первое
          касание кнопки уходило на закрытие клавиатуры. */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FieldLabel colors={colors}>{t("Агент *", "Agent *")}</FieldLabel>
        {agentsLoading ? (
          <View style={{ gap: Spacing.sm }}>
            {[1, 2].map(i => (
              <ShimmerSkeleton key={i} height={64} radius={Radii.xl} />
            ))}
          </View>
        ) : (agents ?? []).length === 0 ? (
          <Text
            style={{
              fontFamily: Typography.fontRegular,
              fontSize: Typography.size.sm,
              color: colors.text.tertiary,
            }}
          >
            {t("Нет активных агентов", "Faol agentlar yo'q")}
          </Text>
        ) : (
          agents!.map(a => (
            <SelectRow
              key={a.id}
              label={a.name}
              icon="user"
              selected={agentId === a.id}
              colors={colors}
              isDark={isDark}
              onPress={() => setAgentId(a.id)}
            />
          ))
        )}

        <FieldLabel colors={colors}>{t("Территория *", "Territoriya *")}</FieldLabel>
        {shopsLoading ? (
          <View style={{ gap: Spacing.sm }}>
            {[1, 2, 3].map(i => (
              <ShimmerSkeleton key={i} height={64} radius={Radii.xl} />
            ))}
          </View>
        ) : territories.length === 0 ? (
          <Text
            style={{
              fontFamily: Typography.fontRegular,
              fontSize: Typography.size.sm,
              color: colors.text.tertiary,
            }}
          >
            {t("Нет магазинов", "Do'konlar yo'q")}
          </Text>
        ) : (
          territories.map(terr => (
            <SelectRow
              key={terr.territory}
              label={terr.territory}
              sublabel={t(`${terr.count} магазинов`, `${terr.count} ta do'kon`)}
              icon="map-pin"
              selected={selectedTerritory === terr.territory}
              colors={colors}
              isDark={isDark}
              onPress={() => setSelectedTerritory(terr.territory)}
            />
          ))
        )}

        {selectedShops.length > 0 && (
          <View
            style={{
              backgroundColor: colors.brand.primaryDim,
              borderRadius: Radii.lg,
              padding: Spacing.md,
              marginTop: Spacing.sm,
            }}
          >
            <Text
              style={{
                fontFamily: Typography.fontSemibold,
                fontSize: Typography.size.xs,
                color: colors.accent.primary,
                marginBottom: 4,
              }}
            >
              {t("БУДУТ НАЗНАЧЕНЫ", "TAYINLANADI")}
            </Text>
            {selectedShops.slice(0, 5).map(s => (
              <Text
                key={s.id}
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: Typography.size.sm,
                  color: colors.text.secondary,
                }}
              >
                • {s.name}
              </Text>
            ))}
            {selectedShops.length > 5 && (
              <Text
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: Typography.size.xs,
                  color: colors.text.tertiary,
                  marginTop: 2,
                }}
              >
                {t(`...и ещё ${selectedShops.length - 5}`, `...va yana ${selectedShops.length - 5}`)}
              </Text>
            )}
          </View>
        )}

        <FieldLabel colors={colors}>{t("Примечания", "Izohlar")}</FieldLabel>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t("Для всех магазинов территории…", "Territoriyadagi barcha do'konlar uchun…")}
          placeholderTextColor={colors.text.muted}
          multiline
          style={{
            backgroundColor: colors.bg.input,
            borderRadius: Radii.lg, ...soft(isDark).inset,
            padding: Spacing.md,
            fontFamily: Typography.fontRegular,
            fontSize: Typography.size.base,
            color: colors.text.primary,
            minHeight: 64,
            textAlignVertical: "top",
          }}
        />

        <View style={{ marginTop: Spacing.xl }}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            disabled={!agentId || !selectedTerritory}
            onPress={() => {
              if (!agentId || !selectedTerritory) {
                notify.error(t("Выберите агента и территорию", "Agent va territoriya tanlang"));
                return;
              }
              mutation.mutate();
            }}
          >
            {t(`Создать план (${selectedShops.length})`, `Reja yaratish (${selectedShops.length})`)}
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
