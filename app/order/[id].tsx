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
  updateOrderItems,
  setPromisedDelivery,
  getProducts,
  type OrderDetail,
} from "../../src/api";
import {
  Radii,
} from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { isRetryableError } from "../../src/store/offline";
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
import { OrderComments } from "../../src/components/order/OrderComments";
import { PromisedDelivery } from "../../src/components/order/PromisedDelivery";
import { canMovePromise } from "../../src/lib/promised-delivery";
import { Card } from "../../src/components/ui";
import { Spacing } from "../../src/theme";
import { errorText } from "../../src/lib/error-text";
import { useT } from "../../src/i18n";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets.top);
  const t = useT();
  const queryClient = useQueryClient();
  const fadeIn = useSharedValue(0);

  // Ошибка не подменяется. Раньше queryFn ловил ЛЮБУЮ и превращал её в «Заказ
  // не найден» — вместе с обрывом связи, таймаутом и перезапуском сервера.
  // Агент на слабой связи открывал свой же заказ и читал, что заказа нет, а
  // ниже — что его, возможно, удалили или лишили прав. Он звонил в офис вместо
  // того, чтобы просто повторить.
  const { data: order, isLoading, isError, error, refetch, isFetching } = useQuery<OrderDetail | null>({
    queryKey: ["order", id],
    queryFn: () => getOrderById(Number(id)),
    enabled: !!id,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(Number(id)),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Заказ отменён", "Buyurtma bekor qilindi"));
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(t("Не удалось отменить заказ. Попробуйте ещё раз.", "Buyurtmani bekor qilib bo'lmadi. Yana urinib ko'ring."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(Number(id)),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Заказ удалён", "Buyurtma o'chirildi"));
      router.back();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(t("Не удалось удалить заказ. Попробуйте ещё раз.", "Buyurtmani o'chirib bo'lmadi. Yana urinib ko'ring."));
    },
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => updateOrder(Number(id), { notes: editNotes || undefined, discount: editDiscount || undefined }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Заказ обновлён", "Buyurtma yangilandi"));
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(t("Не удалось обновить заказ", "Buyurtmani yangilab bo'lmadi"));
    },
  });

  /*
    Каталог для добавления товара.

    Грузится только когда его попросили: окно правки открывают ради количества
    гораздо чаще, чем ради нового товара, а позиций у организации сотни.
    Отказ гасится в пустой список — тогда в окне просто нечего выбрать, но
    количество правится как раньше.
  */
  const [needCatalog, setNeedCatalog] = useState(false);
  const { data: catalog } = useQuery({
    queryKey: ["catalog", "orderEdit"],
    queryFn: () => getProducts().catch(() => []),
    enabled: needCatalog,
    retry: false,
  });

  const updateItemsMutation = useMutation({
    /*
      Три действия одним списком: изменить количество ({itemId, quantity}),
      убрать позицию ({itemId, quantity: 0}) и добавить товар
      ({productId, quantity, unitPrice}). Так их и понимает сервер.
    */
    mutationFn: (items: Array<{ itemId?: number; productId?: number; quantity: number; unitPrice?: string }>) =>
      updateOrderItems(Number(id), items),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Количество товаров обновлено", "Mahsulot miqdori yangilandi"));
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(t("Не удалось обновить количество", "Miqdorni yangilab bo'lmadi"));
    },
  });

  /*
    Перенести обещанный срок.

    Ровно та возможность, ради которой магазин звонит агенту: «сегодня не
    успеваем — привезём в понедельник». Через правку заказа этого было бы
    не сделать: она открыта только офису.

    Отказ показываем словами сервера: по закрытому заказу он объясняет,
    почему нельзя, и своя выдумка на этом месте была бы хуже.
  */
  const promiseMutation = useMutation({
    mutationFn: (v: string | null) => setPromisedDelivery(Number(id), v),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(t("Срок сохранён", "Muddat saqlandi"));
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(errorText(e));
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
    const shop = order.shopName ?? "—";
    const total = money(order.total);
    const status = STATUS_CONFIG[order.status]?.label ?? order.status;
    Share.share({
      title: t(`Заказ #${order.orderNumber}`, `Buyurtma #${order.orderNumber}`),
      message: t(`Заказ #${order.orderNumber}\nМагазин: ${shop}\nСумма: ${total}\nСтатус: ${status}`, `Buyurtma #${order.orderNumber}\nDo'kon: ${shop}\nSumma: ${total}\nHolat: ${status}`),
    });
  }

  function handleCancel() {
    Alert.alert(
      t("Отменить заказ?", "Buyurtmani bekor qilasizmi?"),
      t("Это действие нельзя отменить.", "Bu amalni qaytarib bo'lmaydi."),
      [
        { text: t("Нет", "Yo'q"), style: "cancel" },
        {
          text: t("Да, отменить", "Ha, bekor qilish"),
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
      t("Удалить заказ?", "Buyurtmani o'chirasizmi?"),
      t("Заказ будет скрыт из списка. Это действие нельзя отменить.", "Buyurtma ro'yxatdan yashiriladi. Bu amalni qaytarib bo'lmaydi."),
      [
        { text: t("Нет", "Yo'q"), style: "cancel" },
        {
          text: t("Да, удалить", "Ha, o'chirish"),
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
    // Запрос не дошёл — это про связь, а не про заказ: та же проверка, что
    // решает, класть ли действие в очередь. Тогда заказ на месте, и человеку
    // нужна кнопка «Повторить», а не рассказ про удаление и права.
    const noConnection = isError && isRetryableError(error);
    return (
      <View style={styles.centered}>
        <View style={[styles.errorIcon, { backgroundColor: noConnection ? colors.status.warningDim : colors.status.dangerDim }]}>
          <Feather name={noConnection ? "wifi-off" : "alert-triangle"} size={28} color={noConnection ? colors.status.warning : colors.status.danger} />
        </View>
        <Text style={styles.errorTitle}>{noConnection ? t("Заказ не загрузился", "Buyurtma yuklanmadi") : t("Заказ не найден", "Buyurtma topilmadi")}</Text>
        <Text style={styles.errorSub}>
          {noConnection
            ? t("Нет связи с сервером. Заказ на месте — попробуйте ещё раз.", "Server bilan aloqa yo'q. Buyurtma joyida — yana urinib ko'ring.")
            : t("Возможно, он был удалён или у вас нет доступа.", "Ehtimol, u o'chirilgan yoki sizga ruxsat yo'q.")}
        </Text>
        {noConnection && (
          <TouchableOpacity onPress={() => refetch()} style={[styles.errorBtn, { backgroundColor: colors.brand.primary, borderRadius: Radii.xl }]}>
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={styles.errorBtnText}>{t("Повторить", "Qayta urinish")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.errorBtn, { backgroundColor: noConnection ? colors.bg.elevated : colors.brand.primary, borderRadius: Radii.xl }]}
        >
          <Feather name="arrow-left" size={16} color={noConnection ? colors.text.primary : "#fff"} />
          <Text style={[styles.errorBtnText, noConnection && { color: colors.text.primary }]}>{t("Назад к заказам", "Buyurtmalarga qaytish")}</Text>
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
          <Text style={styles.topBarTitle}>{t("Заказ", "Buyurtma")} #{order.orderNumber}</Text>
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
        {/*
          Обещанный срок — сразу под сведениями о заказе: агент, открывший
          карточку по звонку «где мой товар», ищет здесь именно его.
        */}
        <Card style={{ marginTop: Spacing.md }}>
          <PromisedDelivery
            value={order.promisedDeliveryAt ?? null}
            onChange={(v) => promiseMutation.mutate(v)}
            status={order.status}
            deliveredAt={order.deliveredAt ?? null}
            editable={canMovePromise(order.status)}
            disabled={promiseMutation.isPending}
          />
        </Card>
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
        {/*
          Переписка — под действиями, а не над ними: сперва то, что с заказом
          делают, потом то, что о нём говорят. Обе ручки открыты агенту и не
          вызывались из приложения ниоткуда — переписка велась в вебе, а
          агент, которого она касается, её не видел.
        */}
        <OrderComments orderId={Number(id)} />
        <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>

      <OrderEditModal
        visible={showEditModal}
        notes={editNotes}
        discount={editDiscount}
        items={(order?.items ?? []).map(item => ({
          id: item.id,
          // Товар нужен, чтобы добавленную строку было чем отправить: сервер
          // различает правку позиции (itemId) и вставку новой (productId).
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          // С сервера «2.00» строкой; в окне правки сравнивается числом —
          // иначе нетронутая строка считалась изменённой, а поле показывало «2.00».
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice) || 0,
          unit: item.unit,
        }))}
        saving={updateMutation.isPending || updateItemsMutation.isPending}
        onNotesChange={setEditNotes}
        onDiscountChange={setEditDiscount}
        catalog={catalog}
        onNeedCatalog={() => setNeedCatalog(true)}
        onSaveItems={(items) => updateItemsMutation.mutate(items)}
        onSave={() => updateMutation.mutate()}
        onClose={() => setShowEditModal(false)}
        colors={colors}
      />
    </View>
  );
}
