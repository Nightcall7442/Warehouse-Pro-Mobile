/**
 * Чек-лист мерчандайзера: «нет на полке» ≠ «не смотрел».
 *
 * Одна галочка давала обоим одно значение false: отчёт для офиса не нёс
 * информации, а «0 %» читался как «ничего не заполнил», хотя мерчандайзер
 * проверил всё и товара нет. Три состояния на строку: «Есть · Нет», ничего
 * не выбрано — не проверено. На сервер уходят только проверенные строки
 * (контракт present: boolean не меняется), прогресс — проверено из всего.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("app/merchandiser/visit.tsx", "utf8");

describe("чек-лист", () => {
  it("строка — сегмент «Есть · Нет», повтор снимает выбор; цена и акция — только у того, что есть", () => {
    expect(src).toContain('{seg(true, t("Есть", "Bor"), colors.status.success)}');
    expect(src).toContain('{seg(false, t("Нет", "Yo\'q"), colors.status.danger)}');
    expect(src).toContain("if (prev[productId] === value) { const next = { ...prev }; delete next[productId]; return next; }");
    expect(src).toContain("{present === true && (");
  });

  it("на сервер — только проверенные строки", () => {
    expect(src).toContain(".filter(r => r.productId in present)");
    expect(src).not.toContain("present: present[r.productId] ?? false");
  });

  it("прогресс — проверено из всего; в подтверждении есть/нет/не проверено", () => {
    expect(src).toContain("Math.round((checkedCount / totalItems) * 100)");
    expect(src).toContain("не проверено ${unchecked}");
  });
});
