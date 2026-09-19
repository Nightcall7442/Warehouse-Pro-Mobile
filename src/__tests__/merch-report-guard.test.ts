/**
 * Отчёт мерчандайзера не уходит пустым молча.
 *
 * Каталог не доехал (подвал ТЦ) — экран открывался с нулём товаров,
 * «0/0 (0 %)», и «Завершить визит» закрывал его пустым отчётом. Или
 * сознательно: 0 фото, 0 отметок — тоже проходило. В руководстве написано
 * «визит без фото не подтверждён»; пустые визиты — оплаченная нерабочая смена.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("app/merchandiser/visit.tsx", "utf8");

describe("отчёт мерчандайзера", () => {
  it("отказ каталога — экран ошибки с «Повторить», а не пустой чек-лист", () => {
    expect(src).toContain("if (productsError && rows.length === 0)");
    expect(src).toMatch(/<ErrorState what=\{t\("каталог", "katalog"\)\}/);
  });

  it("подтверждение — с цифрами; без фото — предупреждение и дорога к камере", () => {
    expect(src).toContain("Без фото визит не будет подтверждён");
    expect(src).toContain('{ text: t("Сделать фото", "Rasmga olish"), onPress: () => pickPhoto(true) }');
    expect(src).toContain("фото · есть ${presentCount} · нет ${checkedCount - presentCount} · не проверено ${unchecked}");
    expect(src).not.toContain('t("Отчёт будет отправлен", "Hisobot yuboriladi")');
  });
});
