// Warehouse Pro — Visit Plans (matches shops.tsx card language)
import { useState, useMemo, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SectionList,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  getPlans,
  updatePlanStatus,
  saveVisitPhoto,
  createPlan,
  getAgentsList,
  getAllShops,
  uploadFile,
  Plan,
  ShopSummary,
} from "../../src/api";
import { notify } from "../../src/store/toast";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../src/theme";
import { ScreenHeader, Button, EmptyState } from "../../src/components/ui";
import { NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getStatusMeta(status: Plan["status"], colors: ThemeColors) {
  switch (status) {
    case "visited":
      return {
        label: "Посещён",
        icon: "check-circle" as const,
        color: colors.accent.success,
        bg: colors.status.successDim,
      };
    case "skipped":
      return {
        label: "Пропущен",
        icon: "clock" as const,
        color: colors.accent.warning,
        bg: colors.status.warningDim,
      };
    default:
      return {
        label: "Запланирован",
        icon: "calendar" as const,
        color: colors.accent.info,
        bg: colors.status.infoDim,
      };
  }
}

// ── Plan row — same card recipe as ShopCard in shops.tsx ──────────────────────
// Read-only by default (used for supervisor); pass onVisit/onSkip to make it
// actionable (agent's own plans only).
function PlanRow({
  plan,
  showAgent,
  showCity,
  colors,
  isDark,
  onVisit,
  onSkip,
  loading,
}: {
  plan: Plan;
  showAgent?: boolean;
  showCity?: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onVisit?: () => void;
  onSkip?: () => void;
  loading?: boolean;
}) {
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const sc = isDark ? "#000" : Shadows.sm.shadowColor;
  const meta = getStatusMeta(plan.status, colors);
  const canAct = plan.status === "planned" && (onVisit || onSkip);

  return (
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: Radii.xxl,
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
        padding: Spacing.xl,
        shadowColor: sc,
        shadowOffset: Shadows.sm.shadowOffset,
        shadowOpacity: Shadows.sm.shadowOpacity,
        shadowRadius: Shadows.sm.shadowRadius,
        elevation: Shadows.sm.elevation,
        opacity: plan.status === "visited" ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg }}>
        {/* Status circle — circular badge */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: meta.bg,
            borderWidth: 2,
            borderColor: meta.color + "30",
          }}
        >
          <Feather name={meta.icon} size={18} color={meta.color} />
        </View>
        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: Typography.size.base,
                  color: colors.text.primary,
                }}
                numberOfLines={1}
              >
                {plan.shopName ?? "Магазин"}
              </Text>
              {showAgent && plan.agentName && (
                <Text
                  style={{
                    fontFamily: Typography.fontRegular,
                    fontSize: Typography.size.xs,
                    color: colors.text.secondary,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {plan.agentName}
                </Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: meta.bg,
                borderRadius: Radii.full,
                paddingHorizontal: 9,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: meta.color }}>
                {meta.label}
              </Text>
            </View>
          </View>
          {(plan.shopAddress || (showCity && plan.shopCity)) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
              <Feather name="map-pin" size={10} color={colors.text.secondary} />
              <Text
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: 11,
                  color: colors.text.secondary,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {[showCity ? plan.shopCity : null, plan.shopAddress].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
          {hasDebt && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 6,
                alignSelf: "flex-start",
                backgroundColor: colors.status.dangerDim,
                borderRadius: Radii.full,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Feather name="alert-circle" size={10} color={colors.status.danger} />
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: 11,
                  color: colors.status.danger,
                }}
              >
                {Number(plan.shopDebt).toLocaleString("ru")} сум
              </Text>
            </View>
          )}
        </View>
      </View>

      {canAct && (
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.lg }}>
          {onVisit && (
            <View style={{ flex: 1 }}>
              <Button
                variant="success"
                size="sm"
                icon="check-circle"
                onPress={onVisit}
                loading={loading}
                style={{ width: "100%" }}
              >
                Готово
              </Button>
            </View>
          )}
          {onSkip && (
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                size="sm"
                icon="clock"
                onPress={onSkip}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Пропустить
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Bottom sheet — same pattern as order/new.tsx ProductPicker ───────────────
function BottomSheet({
  visible,
  onClose,
  title,
  colors,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  colors: ThemeColors;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.bg.overlayDark }} onPress={onClose}>
        <Pressable
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "86%",
            backgroundColor: colors.bg.secondary,
            borderTopLeftRadius: Radii.xxl,
            borderTopRightRadius: Radii.xxl,
            overflow: "hidden",
          }}
          onPress={e => e.stopPropagation()}
        >
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: Radii.full,
                backgroundColor: colors.border.default,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: Spacing.base,
              paddingBottom: Spacing.md,
            }}
          >
            <Text
              style={{
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.lg,
                color: colors.text.primary,
              }}
            >
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.bg.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="x" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Selectable row — same visual language as shops.tsx territory cards ───────
function SelectRow({
  label,
  sublabel,
  icon,
  selected,
  colors,
  isDark,
  onPress,
}: {
  label: string;
  sublabel?: string;
  icon: keyof typeof Feather.glyphMap;
  selected: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onPress: () => void;
}) {
  const sc = isDark ? "#000" : Shadows.sm.shadowColor;
  return (
    <PressableScale onPress={onPress} haptic="selection" style={{ marginBottom: Spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.md,
          backgroundColor: colors.bg.card,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
          padding: Spacing.lg,
          shadowColor: sc,
          shadowOffset: Shadows.sm.shadowOffset,
          shadowOpacity: Shadows.sm.shadowOpacity,
          shadowRadius: Shadows.sm.shadowRadius,
          elevation: Shadows.sm.elevation,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: Radii.md,
            backgroundColor: selected ? colors.accent.primary : colors.brand.primaryDim,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={17} color={selected ? "#fff" : colors.accent.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: Typography.fontSemibold,
              fontSize: Typography.size.base,
              color: colors.text.primary,
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontFamily: Typography.fontRegular,
                fontSize: Typography.size.xs,
                color: colors.text.tertiary,
                marginTop: 2,
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>
        {selected && <Feather name="check" size={18} color={colors.accent.primary} />}
      </View>
    </PressableScale>
  );
}

function FieldLabel({ children, colors }: { children: string; colors: ThemeColors }) {
  return (
    <Text
      style={{
        fontFamily: Typography.fontBold,
        fontSize: Typography.size.xs,
        color: colors.text.muted,
        letterSpacing: 1.5,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

// ── Create-plan modal — supervisor only (territory-based) ─────────────────────
function CreatePlanModal({
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
      const territory = shop.district || shop.city || "Без территории";
      if (!map.has(territory)) map.set(territory, []);
      map.get(territory)!.push(shop);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([territory, shops]) => ({ territory, shops, count: shops.length }));
  }, [allShops]);

  const selectedShops = useMemo(() => {
    if (!selectedTerritory) return [];
    return territories.find(t => t.territory === selectedTerritory)?.shops ?? [];
  }, [territories, selectedTerritory]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agentId || !selectedShops.length) return;
      const results = [];
      for (const shop of selectedShops) {
        const result = await createPlan({
          agentId,
          shopId: shop.id,
          planDate: date,
          notes: notes || undefined,
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      notify.success(`Создано ${selectedShops.length} планов`);
      const createdAgent = agentId ?? undefined;
      reset();
      onCreated(createdAgent);
    },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось создать планы"),
  });

  function reset() {
    setAgentId(null);
    setSelectedTerritory(null);
    setNotes("");
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={reset} title="Новый план визита" colors={colors}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <FieldLabel colors={colors}>Агент *</FieldLabel>
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
            Нет активных агентов
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

        <FieldLabel colors={colors}>Территория *</FieldLabel>
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
            Нет магазинов
          </Text>
        ) : (
          territories.map(t => (
            <SelectRow
              key={t.territory}
              label={t.territory}
              sublabel={`${t.count} магазинов`}
              icon="map-pin"
              selected={selectedTerritory === t.territory}
              colors={colors}
              isDark={isDark}
              onPress={() => setSelectedTerritory(t.territory)}
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
              borderWidth: 1,
              borderColor: colors.border.subtle,
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
              БУДУТ НАЗНАЧЕНЫ
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
                ...и ещё {selectedShops.length - 5}
              </Text>
            )}
          </View>
        )}

        <FieldLabel colors={colors}>Примечания</FieldLabel>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Для всех магазинов территории…"
          placeholderTextColor={colors.text.muted}
          multiline
          style={{
            backgroundColor: colors.bg.input,
            borderRadius: Radii.lg,
            borderWidth: 1,
            borderColor: colors.border.default,
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
                notify.error("Выберите агента и территорию");
                return;
              }
              mutation.mutate();
            }}
          >
            {`Создать план (${selectedShops.length})`}
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Date navigator — timeline stepper with dots ────────────────────────────────
function DateNav({
  date,
  isToday: _isToday,
  colors,
  onPrev,
  onNext,
}: {
  date: Date;
  isToday: boolean;
  colors: ThemeColors;
  onPrev: () => void;
  onNext: () => void;
}) {
  const days = useMemo(() => {
    const result = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(date.getTime() + i * 86_400_000);
      const isCurrent = i === 0;
      result.push({ date: d, isCurrent, label: d.toLocaleDateString("ru", { weekday: "short" }), dayNum: d.getDate() });
    }
    return result;
  }, [date]);

  return (
    <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: Spacing.md, borderWidth: 1, borderColor: colors.border.default }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
        <PressableScale onPress={onPrev} haptic="light">
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-left" size={16} color={colors.text.primary} />
          </View>
        </PressableScale>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary, textTransform: "capitalize" }}>
            {date.toLocaleDateString("ru", { weekday: "long" })}
          </Text>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
            {date.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </View>
        <PressableScale onPress={onNext} haptic="light">
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-right" size={16} color={colors.text.primary} />
          </View>
        </PressableScale>
      </View>
      {/* Timeline dots */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.xs }}>
        {days.map((d, i) => (
          <PressableScale key={i} onPress={() => {
            const diff = d.date.getTime() - date.getTime();
            if (diff !== 0) {
              const fn = diff > 0 ? onNext : onPrev;
              for (let j = 0; j < Math.abs(Math.round(diff / 86_400_000)); j++) fn();
            }
          }} haptic="light" style={{ alignItems: "center", gap: 4 }}>
            <View style={{
              width: d.isCurrent ? 36 : 28,
              height: d.isCurrent ? 36 : 28,
              borderRadius: d.isCurrent ? 18 : 14,
              backgroundColor: d.isCurrent ? colors.brand.primary : "transparent",
              borderWidth: d.isCurrent ? 0 : 1.5,
              borderColor: d.isCurrent ? "transparent" : colors.border.default,
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Text style={{
                fontFamily: d.isCurrent ? Typography.fontBold : Typography.fontMedium,
                fontSize: d.isCurrent ? Typography.size.base : Typography.size.xs,
                color: d.isCurrent ? "#fff" : colors.text.secondary,
              }}>
                {d.dayNum}
              </Text>
            </View>
            <Text style={{
              fontFamily: Typography.fontMedium,
              fontSize: 9,
              color: d.isCurrent ? colors.accent.primary : colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {d.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

// ── Supervisor view — read-only. Supervisors assign plans but do not change
//    their status themselves; that stays an agent-only action (see AgentPlansView).
function SupervisorPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agentsList"],
    queryFn: getAgentsList,
  });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const {
    data: plans,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: 60_000,
  });

  // Group by agent when no filter is selected
  const groupedPlans = useMemo(() => {
    if (filterAgentId || !plans || plans.length === 0) return null;
    const groups: Record<string, Plan[]> = {};
    for (const plan of plans) {
      const key = plan.agentName ?? `Агент #${plan.agentId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(plan);
    }
    return Object.entries(groups).map(([agentName, items]) => ({ title: agentName, data: items }));
  }, [plans, filterAgentId]);

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Планы визитов"
        right={
          <PressableScale onPress={() => setShowCreate(true)} haptic="light">
            <View
              style={{
                backgroundColor: colors.accent.primary,
                borderRadius: Radii.full,
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </View>
          </PressableScale>
        }
      />

      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm }}>
        <DateNav
          date={date}
          isToday={isToday}
          colors={colors}
          onPrev={() => setDate(d => new Date(d.getTime() - 86_400_000))}
          onNext={() => setDate(d => new Date(d.getTime() + 86_400_000))}
        />

        <PressableScale onPress={() => setShowAgentPicker(true)} haptic="selection">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.sm,
              backgroundColor: colors.bg.card,
              borderRadius: Radii.md,
              borderWidth: 1,
              borderColor: filterAgentId ? colors.accent.primary : colors.border.default,
              padding: 10,
            }}
          >
            <Feather
              name="user"
              size={15}
              color={filterAgentId ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: Typography.fontMedium,
                fontSize: Typography.size.sm,
                color: filterAgentId ? colors.text.primary : colors.text.muted,
              }}
            >
              {selectedAgent?.name ?? "Все агенты"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.text.muted} />
          </View>
        </PressableScale>

        {total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <Text
              style={{
                fontFamily: Typography.fontMono,
                fontSize: Typography.size.sm,
                color: colors.text.secondary,
              }}
            >
              {visited}/{total}
            </Text>
            <NeumorphicProgressBar
              value={pct}
              height={6}
              color={pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.brand.primary}
              style={{ flex: 1 }}
            />
            <Text
              style={{
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.sm,
                color: colors.text.primary,
              }}
            >
              {pct}%
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => (
            <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />
          ))}
        </View>
      ) : !filterAgentId && groupedPlans ? (
        <SectionList
          sections={groupedPlans}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + 100,
          }}
          stickySectionHeadersEnabled
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
              <Text
                style={{
                  fontFamily: Typography.fontBold,
                  fontSize: Typography.size.sm,
                  color: colors.accent.primary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {section.title} · {section.data.length}
              </Text>
            </View>
          )}
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow plan={plan} showCity colors={colors} isDark={isDark} />
            </FadeInItem>
          )}
          ListEmptyComponent={<EmptyState icon="calendar" title="На этот день планов нет" />}
        />
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + 100,
          }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="На этот день планов нет"
              description="Нажмите «+», чтобы назначить маршрут"
            />
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow
                plan={plan}
                showAgent={!filterAgentId}
                showCity
                colors={colors}
                isDark={isDark}
              />
            </FadeInItem>
          )}
        />
      )}

      {/* Agent picker */}
      <BottomSheet
        visible={showAgentPicker}
        onClose={() => setShowAgentPicker(false)}
        title="Выберите агента"
        colors={colors}
      >
        <FlatList
          data={agents ?? []}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingBottom: insets.bottom + Spacing.lg,
          }}
          ListHeaderComponent={
            <SelectRow
              label="Все агенты"
              icon="users"
              selected={!filterAgentId}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                setFilterAgentId(null);
                setShowAgentPicker(false);
              }}
            />
          }
          ListEmptyComponent={
            !agentsLoading ? (
              <EmptyState
                icon="user"
                title="Нет агентов"
                description="Добавьте агентов в систему"
              />
            ) : null
          }
          renderItem={({ item: agent }) => (
            <SelectRow
              label={agent.name}
              icon="user"
              selected={filterAgentId === agent.id}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                setFilterAgentId(agent.id);
                setShowAgentPicker(false);
              }}
            />
          )}
        />
      </BottomSheet>

      <CreatePlanModal
        visible={showCreate}
        date={dateStr}
        onClose={() => setShowCreate(false)}
        onCreated={(agentId?: number) => {
          setShowCreate(false);
          if (agentId) {
            setFilterAgentId(agentId);
            setTimeout(() => qc.invalidateQueries({ queryKey: ["supervisorPlans"] }), 100);
          }
        }}
      />
    </View>
  );
}

// ── Agent view — own plans for today; the only role that can change status ───
function AgentPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const isMerchandiser = user?.role === "merchandiser";

  const {
    data: plans,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["agentPlans"],
    queryFn: () => getPlans(),
    refetchInterval: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) =>
      updatePlanStatus(planId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success("Статус обновлён");
    },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const photoMutation = useMutation({
    mutationFn: ({ planId, photoUrl }: { planId: number; photoUrl: string }) =>
      saveVisitPhoto(planId, photoUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success("Фото отправлено, визит отмечен");
    },
    onError: (e: Error) => notify.error(e.message ?? "Ошибка отправки фото"),
  });

  const handleTakePhoto = async (planId: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Нет доступа", "Разрешите доступ к камере в настройках");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      try {
        const url = await uploadFile(`data:image/jpeg;base64,${result.assets[0].base64}`, "shops");
        photoMutation.mutate({ planId, photoUrl: url });
      } catch {
        notify.error("Ошибка загрузки фото");
      }
    }
  };

  const handleVisitDone = (planId: number, planName: string, shopId?: number) => {
    if (isMerchandiser) {
      router.push({
        pathname: "/merchandiser/visit",
        params: { planId: String(planId), shopId: String(shopId ?? ""), shopName: planName },
      });
      return;
    }
    Alert.alert("Подтвердить визит", `Отметить "${planName}" как посещённый?`, [
      { text: "Отмена", style: "cancel" },
      { text: "Без фото", onPress: () => updateMutation.mutate({ planId, status: "visited" }) },
      { text: "С фото", onPress: () => handleTakePhoto(planId) },
    ]);
  };

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const today = new Date();
  const greeting =
    today.getHours() < 12 ? "Доброе утро" : today.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Мои планы"
        subtitle={`${greeting} — ${today.toLocaleDateString("ru", { day: "numeric", month: "long" })}`}
      />

      {total > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.sm,
            marginTop: Spacing.md,
            marginHorizontal: Spacing.base,
          }}
        >
          <Text
            style={{
              fontFamily: Typography.fontMono,
              fontSize: Typography.size.sm,
              color: colors.text.secondary,
            }}
          >
            {visited}/{total}
          </Text>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.bg.elevated,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  pct === 100
                    ? colors.accent.success
                    : pct >= 60
                      ? colors.accent.warning
                      : colors.accent.primary,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: Typography.fontBold,
              fontSize: Typography.size.sm,
              color: colors.text.primary,
            }}
          >
            {pct}%
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => (
            <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />
          ))}
        </View>
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="Планов на сегодня нет"
              description="Супервайзер ещё не назначил маршрут"
            />
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow
                plan={plan}
                colors={colors}
                isDark={isDark}
                onVisit={() => handleVisitDone(plan.id, plan.shopName ?? "Магазин", plan.shopId)}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                loading={updateMutation.isPending || photoMutation.isPending}
              />
            </FadeInItem>
          )}
        />
      )}
    </View>
  );
}

// ── Main screen — role-based routing ──────────────────────────────────────────
// NB: Plans/route-management is ceo+supervisor only on the backend (see
// api/agent-router.ts — listAgents, listShopsForPlan, createPlan all use
// supervisorQuery, which only allows ["ceo","supervisor"]). "operator" must
// NOT be routed into SupervisorPlansView or its queries/mutations will 403.
export default function PlansScreen() {
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo";

  if (isSupervisor) {
    return <SupervisorPlansView />;
  }
  return <AgentPlansView />;
}
