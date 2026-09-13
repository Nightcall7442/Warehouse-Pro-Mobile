/**
 * Карточка товара: до кнопки можно дотянуться, и она не врёт.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Владелец прислал снимок с телефона: лист товара открыт, а кнопка «Добавить в
 * заказ» обрезана нижним краем ровно наполовину и лежит на системной панели
 * Android. Нажать её нельзя — палец попадает в «Назад».
 *
 * Причин было две, и обе в разметке. Снимок товара занимал 45% ВЫСОТЫ ЭКРАНА,
 * лист ограничен 92% и режет лишнее (overflow: hidden) — на телефон с тремя
 * кнопками навигации содержимое просто не помещалось. И сам лист приклеен к
 * нижнему краю окна, которое на Android заходит ПОД системную панель.
 *
 * На том же снимке видно второе: «ОСТАТОК 0 шт», а «плюс» и кнопка работают.
 * Агент набирал позицию, которой нет, и узнавал об этом отказом сервера —
 * посреди разговора с хозяином магазина.
 */
jest.mock("../store/theme", () => ({
  useThemeColors: () => ({
    bg: { card: "#fff", elevated: "#f0f0f0", secondary: "#fafafa", input: "#e0e0e0", primary: "#000" },
    text: { primary: "#000", secondary: "#666", muted: "#999" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0" },
    accent: { primary: "#3b6fe0", success: "#34c473", warning: "#d4973a", danger: "#d45050" },
    status: { success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 48, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("../components/SecureImage", () => ({ SecureImage: "SecureImage" }));

// Экран каталога тянет обновление по возврату на вкладку, а оно — весь
// expo-router с навигацией. Для карточки товара это лишнее.
jest.mock("../hooks/useRefreshOnFocus", () => ({ useRefreshOnFocus: () => {} }));

import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductDetail } from "../../app/(tabs)/catalog";
import { LightColors } from "../theme";
import type { Product } from "../api";

const product = (available: number) => ({
  id: 1,
  name: "E L I F OK УНИВЕРСАЛ 72% 1 L",
  code: "A53",
  unitPrice: 9500,
  available,
  unit: "pcs",
  photoUrl: null,
}) as unknown as Product;

function show(available: number, onAdd: (qty: number) => void = jest.fn()) {
  return render(
    <ProductDetail
      product={product(available)}
      visible
      onClose={jest.fn()}
      onAdd={onAdd}
      colors={LightColors}
      isDark={false}
      fmt={(v) => `${String(v)} сум`}
    />,
  );
}

describe("кнопку видно при любом содержимом", () => {
  it("кнопка стоит после прокручиваемой части, а не внутри неё", () => {
    /*
      Пока кнопка лежала внутри прокрутки, её выносило за нижний край листа
      вместе с остальным содержимым — и обрезало. Проверяется порядок в самой
      разметке: это то единственное, что отличает «видно всегда» от «видно,
      если поместилось», и что не поймает ни один тип и ни один линтер.
    */
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/(tabs)/catalog.tsx"),
      "utf8",
    );
    const sheet = src.slice(src.indexOf("export function ProductDetail"));
    const scrollEnds = sheet.indexOf("</ScrollView>");
    // Подпись берём вместе с разметкой: те же слова стоят в объяснении выше
    // по файлу, и без этого проверка искала бы их в рассказе о прошлой беде.
    const button = sheet.indexOf(`{outOfStock ? t("Нет в наличии", "Omborda yo'q") : t("Добавить в заказ", "Buyurtmaga qo'shish")}`);

    expect(scrollEnds).toBeGreaterThan(0); // прокрутка в карточке товара пропала
    expect(button).toBeGreaterThan(0); // кнопка добавления пропала
    expect(scrollEnds).toBeLessThan(button);
  });
});

describe("нулевой остаток", () => {
  it("кнопка говорит «Нет в наличии»", () => {
    show(0);
    expect(screen.getByText("Нет в наличии")).toBeTruthy();
    expect(screen.queryByText("Добавить в заказ")).toBeNull();
  });

  it("нажатие ничего не добавляет", () => {
    const onAdd = jest.fn();
    show(0, onAdd);
    fireEvent.click(screen.getByText("Нет в наличии"));
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("остаток есть", () => {
  it("кнопка добавляет выбранное количество", () => {
    const onAdd = jest.fn();
    show(5, onAdd);
    fireEvent.click(screen.getByText("Добавить в заказ"));
    expect(onAdd).toHaveBeenCalledWith(1);
  });
});
