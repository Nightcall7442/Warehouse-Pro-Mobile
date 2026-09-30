/**
 * Причина удержания заказа после отправки.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * После отправки удержанного заказа телефон писал «ждёт подтверждения офиса —
 * скидка выше порога» про любое удержание. С веб-PR #145 сервер держит заказ
 * и за просроченный долг магазина — агент читал бы про скидку, которой не
 * давал, и шёл спорить не о том.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 *   - причина с сервера доходит до сообщения, по-русски как есть;
 *   - по-узбекски известные части переведены по шаблону веба, незнакомые
 *     оставлены как есть, части через «; » переводятся каждая;
 *   - старый сервер без причины — прежнее сообщение про скидку;
 *   - экран заказа берёт сообщение из ответа order.create, а не своё.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { heldNotice, holdReasonText } from "../lib/hold-reason";

const OVERDUE = "Просроченный долг: 800 000 сум, самый старый — 40 дн.";
const DISCOUNT = "Скидка 12% выше порога 10% для полевых сотрудников";

describe("перевод причины удержания", () => {
  it("по-русски — как прислал сервер", () => {
    expect(holdReasonText(OVERDUE, "ru")).toBe(OVERDUE);
  });

  it("по-узбекски — просрочка и скидка по шаблону веба", () => {
    expect(holdReasonText(OVERDUE, "uz")).toBe("Muddati o'tgan qarz: 800 000 сум, eng eskisi — 40 kun");
    expect(holdReasonText(DISCOUNT, "uz")).toBe("Chegirma 12% dala xodimlari uchun 10% chegaradan yuqori");
  });

  it("обе причины сразу — каждая часть своя, незнакомая остаётся", () => {
    expect(holdReasonText(`${DISCOUNT}; ${OVERDUE}; что-то новое`, "uz")).toBe(
      "Chegirma 12% dala xodimlari uchun 10% chegaradan yuqori; Muddati o'tgan qarz: 800 000 сум, eng eskisi — 40 kun; что-то новое",
    );
  });

  it("пусто — пустая строка", () => {
    expect(holdReasonText(null, "uz")).toBe("");
  });
});

const ru = (a: string, _b: string) => a;
const uz = (_a: string, b: string) => b;

describe("сообщение агенту после отправки", () => {
  it("с причиной — настоящая причина на обоих языках", () => {
    expect(heldNotice(OVERDUE, ru)).toContain(OVERDUE);
    expect(heldNotice(OVERDUE, ru)).not.toContain("скидка");
    expect(heldNotice(OVERDUE, uz)).toContain("Muddati o'tgan qarz");
  });

  it("старый сервер без причины — прежнее сообщение про скидку", () => {
    expect(heldNotice(undefined, ru)).toBe("Заказ оформлен и ждёт подтверждения офиса — скидка выше порога");
  });

  it("экран заказа берёт причину из ответа сервера", () => {
    const screen = readFileSync(resolve(__dirname, "../../app/order/new.tsx"), "utf8");
    expect(screen).toContain("heldNotice(created.holdReason, t)");
    expect(screen).not.toContain("— скидка выше порога\", \"Buyurtma");
  });
});
