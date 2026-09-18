/**
 * Карточка заказа без дорог в стену.
 *
 * Агент видел «Удалить заказ», подтверждал — «Не удалось удалить. Попробуйте
 * ещё раз». Открывал «Изменить» у доставленного, правил 12 → 8 — «Не удалось
 * обновить количество». Сервер при этом отвечал внятно («заказ уже у
 * курьера — оформляется возвратом через офис»), а экран прятал текст.
 * Вкладка «Детали» у агента не сохранялась никогда (order.update — офис).
 */
import { readFileSync } from "node:fs";

const card = readFileSync("app/order/[id].tsx", "utf8");
const actions = readFileSync("src/components/order/OrderActions.tsx", "utf8");
const modal = readFileSync("src/components/order/OrderEditModal.tsx", "utf8");
const items = readFileSync("src/components/order/OrderItems.tsx", "utf8");

describe("карточка заказа", () => {
  it("удаление и «Детали» — только офису; «Изменить» — пока состав можно менять", () => {
    expect(card).toContain('const office = user?.role === "ceo" || user?.role === "operator";');
    expect(card).toMatch(/const canDelete = office && \(/);
    expect(card).toContain('const canEdit = order.status === "new" || order.status === "processing" || order.status === "pending";');
    expect(card).toContain("canEditDetails={office}");
    expect(modal).toContain("{canEditDetails && (");
    expect(actions).toContain("{canEdit && (");
    expect(actions).toContain("Состав менять нельзя");
  });

  it("отказ сервера доходит до экрана словами сервера, а не «Попробуйте ещё раз»", () => {
    expect(card).not.toContain("Попробуйте ещё раз");
    expect(card.match(/notify\.error\(errorText\(e\)\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("кнопки и итоги двуязычны (JSX-текст, который храповик не видит)", () => {
    for (const src of [actions, items]) {
      expect(src).not.toMatch(/>[^<{\n]*[А-Яа-я][^<{\n]*</);
    }
  });
});
