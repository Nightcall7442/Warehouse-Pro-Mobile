import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  RefreshControl,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { notify } from "../../src/store/toast";
import * as Haptics from "expo-haptics";
import {
  getOrderById,
  cancelOrder,
  deleteOrder,
  updateOrder,
  type OrderDetail,
} from "../../src/api";
import {
  Typography,
  Radii,
} from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { PressableScale } from "../../src/components/Animated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  STATUS_CONFIG,
  fmt,
  money,
  makeStyles,
} from "../../src/components/order/OrderStyles";
import { LoadingState, PipelineBanner } from "../../src/components/order/OrderInfo";
import { OrderInfoCard } from "../../src/components/order/OrderInfo";
import { OrderItemsList, OrderFinancialSummary } from "../../src/components/order/OrderItems";
import { OrderActions } from "../../src/components/order/OrderActions";
import { OrderEditModal } from "../../src/components/order/OrderEditModal";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets.top);
  const queryClient = useQueryClient();
  const fadeIn = useSharedValue(0);

  const { data: order, isLoading, isError, refetch, isFetching } = useQuery<OrderDetail>({
    queryKey: ["order", id],
    queryFn: async () => {
      try {
        return await getOrderById(Number(id));
      } catch {
        throw new Error("Заказ не найден");
      }
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(Number(id)),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Заказ отменён");
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error("Не удалось отменить заказ. Попробуйте ещё раз.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(Number(id)),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Заказ удалён");
      router.back();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error("Не удалось удалить заказ. Попробуйте ещё раз.");
    },
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => updateOrder(Number(id), { notes: editNotes || undefined, discount: editDiscount || undefined }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Заказ обновлён");
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error("Не удалось обновить заказ");
    },
  });

  useEffect(() => {
    if (order) {
      fadeIn.value = withTiming(1, { duration: 350 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const fadeInStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  function handleShare() {
    if (!order) return;
    Share.share({
      title: `Заказ #${order.orderNumber}`,
      message: `Заказ #${order.orderNumber}\nМагазин: ${order.shopName ?? "—"}\nСумма: ${money(order.total)}\nСтатус: ${STATUS_CONFIG[order.status]?.label ?? order.status}`,
    });
  }

  function handleCancel() {
    Alert.alert(
      "Отменить заказ?",
      "Это действие нельзя отменить.",
      [
        { text: "Нет", style: "cancel" },
        {
          text: "Да, отменить",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            cancelMutation.mutate();
          },
        },
      ]
    );
  }

  function handleDelete() {
    Alert.alert(
      "Удалить заказ?",
      "Заказ будет скрыт из списка. Это действие нельзя отменить.",
      [
        { text: "Нет", style: "cancel" },
        {
          text: "Да, удалить",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteMutation.mutate();
          },
        },
      ]
    );
  }

  function handleEditOpen() {
    setEditNotes(order?.notes ?? "");
    // order.discount is stored as a money amount server-side; the edit field
    // is labeled "%", so convert back to the percentage it represents.
    const subtotalNum = Number(order?.subtotal ?? 0);
    const discountAmount = Number(order?.discount ?? 0);
    const pct = subtotalNum > 0 ? (discountAmount / subtotalNum) * 100 : 0;
    setEditDiscount(pct > 0 ? String(Number(pct.toFixed(2))) : "");
    setShowEditModal(true);
  }

  if (isLoading) return <LoadingState colors={colors} />;

  if (isError || !order) {
    return (
      <View style={styles.centered}>
        <View style={[styles.errorIcon, { backgroundColor: colors.status.dangerDim }]}>
          <Feather name="alert-triangle" size={28} color={colors.status.danger} />
        </View>
        <Text style={styles.errorTitle}>Заказ не найден</Text>
        <Text style={styles.errorSub}>Возможно, он был удалён или у вас нет доступа.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errorBtn, { backgroundColor: colors.brand.primary, borderRadius: Radii.xl }]}>
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={styles.errorBtnText}>Назад к заказам</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canCancel = order.status === "new" || order.status === "processing";
  const canDelete = order.status === "new" || order.status === "processing" || order.status === "cancelled";
  const subtotal = Number(order.subtotal ?? order.total ?? 0);
  const discountAmount = Number(order.discount ?? 0);
  // OrderFinancialSummary renders this as "−{discount}%" — order.discount is
  // stored as money, so convert to the percentage it represents for display.
  const discount = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  return (
    <View style={styles.root}>
      {/* Fixed top bar */}
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          haptic="light"
          style={styles.topBarBack}
        >
          <Feather name="arrow-left" size={22} color={colors.text.primary} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Заказ #{order.orderNumber}</Text>
          <Text style={styles.topBarSub}>{fmt(order.createdAt)}</Text>
        </View>
        <PressableScale onPress={handleShare} haptic="light" style={styles.topBarAction}>
          <Feather name="share-2" size={18} color={colors.brand.primaryLight} />
        </PressableScale>
      </View>

      <Animated.View style={[{ flex: 1 }, fadeInStyle]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.accent.primary} />}
        >
        <PipelineBanner status={order.status} colors={colors} />
        <OrderInfoCard order={order} colors={colors} />
        <OrderItemsList order={order} colors={colors} />
        <OrderFinancialSummary order={order} subtotal={subtotal} discount={discount} colors={colors} />
        <OrderActions
          canCancel={canCancel}
          canDelete={canDelete}
          cancelPending={cancelMutation.isPending}
          deletePending={deleteMutation.isPending}
          onEdit={handleEditOpen}
          onCancel={handleCancel}
          onDelete={handleDelete}
          colors={colors}
        />
        <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>

      <OrderEditModal
        visible={showEditModal}
        notes={editNotes}
        discount={editDiscount}
        saving={updateMutation.isPending}
        onNotesChange={setEditNotes}
        onDiscountChange={setEditDiscount}
        onSave={() => updateMutation.mutate()}
        onClose={() => setShowEditModal(false)}
        colors={colors}
      />
    </View>
  );
}
