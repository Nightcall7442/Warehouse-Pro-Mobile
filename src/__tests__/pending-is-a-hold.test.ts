/**
 * «В ожидании» — это «ждёт офиса», а не «отгружен».
 *
 * Сервер создаёт заказ в pending, когда его должен подтвердить офис (скидка
 * выше порога), и pending стоит ДО «Новый». Диаграмма рисовала его шагом 2 —
 * «В обработке ✓ → [В ожидании] → Доставлен»: читалось как «уже на складе,
 * вот-вот повезут». Агент обещал магазину «завтра привезут», офис скидку
 * отклонял — заказ отменён, магазин обманут. Причину (holdReason) сервер
 * отдавал всегда, экран не показывал.
 */
import { readFileSync } from "node:fs";
import { STATUS_CONFIG } from "../components/order/OrderStyles";

describe("pending", () => {
  it("на диаграмме — шаг 0 и «пауза», не «отгружен»", () => {
    expect(STATUS_CONFIG.pending.step).toBe(0);
    expect(STATUS_CONFIG.pending.icon).toBe("pause-circle");
    expect(STATUS_CONFIG.pending.badgeVariant).toBe("warning");
  });

  it("карточка показывает плашку «Ждёт подтверждения офиса» с причиной с сервера", () => {
    const info = readFileSync("src/components/order/OrderInfo.tsx", "utf8");
    expect(info).toContain('if (status === "pending")');
    expect(info).toContain("Ждёт подтверждения офиса");
    expect(info).toContain("{holdReason || t(");
    expect(readFileSync("app/order/[id].tsx", "utf8")).toContain("holdReason={order.holdReason}");
    expect(readFileSync("src/api.ts", "utf8")).toContain("holdReason?: string | null;");
  });

  it("в списке заказов у строки есть магазин и состояние; pending — «Ждёт офиса»", () => {
    const list = readFileSync("app/(tabs)/orders.tsx", "utf8");
    expect(list).toContain("{order.shopName ?? order.orderNumber}");
    expect(list).toContain('order.status === "pending" ? t("Ждёт офиса", "Ofisni kutmoqda") : orderStatusLabel(order.status)');
  });
});
