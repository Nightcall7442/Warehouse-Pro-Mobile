import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../store/auth";
import { useOfflineStore } from "../../store/offline";
import type { NoOrderChoice, Plan } from "../../api";
import { visitHasOrder } from "../../lib/no-order-gate";
import { NoOrderReasonSheet } from "./NoOrderReasonSheet";

/**
 * Ворота закрытия визита: заказ есть — пропускают сразу, нет — спрашивают
 * причину. proceed получает выбор (или ничего, если заказ был) и сам зовёт
 * нужное — отметку, камеру, очередь.
 *
 * Очередь заказов читается в момент нажатия, а не подпиской: шторка решается
 * один раз, на касание «Готово».
 */
export function useNoOrderGate(): {
  ask: (plan: Pick<Plan, "hasOrder" | "shopId" | "shopName">, proceed: (choice?: NoOrderChoice) => void) => void;
  sheet: ReactNode;
} {
  const router = useRouter();
  const [pending, setPending] = useState<{ plan: Pick<Plan, "shopId" | "shopName">; proceed: (choice?: NoOrderChoice) => void } | null>(null);

  const ask = (plan: Pick<Plan, "hasOrder" | "shopId" | "shopName">, proceed: (choice?: NoOrderChoice) => void) => {
    const { user } = useAuthStore.getState();
    // Мерчандайзера не касается — как в вебе: его визит закрывается отчётом о полке.
    if (user?.role === "merchandiser" || visitHasOrder(plan, useOfflineStore.getState().orders, user?.id)) {
      proceed();
      return;
    }
    setPending({ plan, proceed });
  };

  const shopId = pending?.plan.shopId;
  const sheet = pending ? (
    <NoOrderReasonSheet
      shopName={pending.plan.shopName}
      onCancel={() => setPending(null)}
      onOrder={shopId ? () => {
        setPending(null);
        router.push({ pathname: "/order/new", params: { shopId: String(shopId), shopName: pending.plan.shopName ?? "" } });
      } : undefined}
      onConfirm={choice => { const go = pending.proceed; setPending(null); go(choice); }}
    />
  ) : null;

  return { ask, sheet };
}
