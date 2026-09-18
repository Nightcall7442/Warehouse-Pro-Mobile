/**
 * Экран товара — app/product/[id].tsx.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Товар открывался нижним листом поверх каталога. Владелец дважды присылал
 * снимок, где кнопка «Добавить в заказ» лежала под системной панелью; потом
 * попросил сделать «как магазины» — отдельный экран с большой фотографией и
 * всеми сведениями. Сервер их отдаёт давно (штрих-код, упаковка, вес,
 * описание), телефон не показывал ни одного.
 *
 * Здесь проверяется то, что ломается молча:
 *   · кнопка стоит ПОСЛЕ прокрутки — иначе её снова унесёт за нижний край;
 *   · нулевой остаток гасит кнопку, а не отправляет заказ в отказ;
 *   · «плюс» не считает выше остатка, и выбранное количество доезжает
 *     до экрана нового заказа;
 *   · сведения с сервера действительно напечатаны;
 *   · без связи экран берёт копию каталога с диска, как и вкладка каталога;
 *   · каталог ведёт на этот экран, маршрут заявлен, а старый лист не вернулся.
 */
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 48, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("../components/SecureImage", () => ({ SecureImage: () => null }));

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockRouteParams: Record<string, string> = { id: "1" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockRouteParams,
  router: { back: mockBack, push: mockPush },
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
}));

jest.mock("../api", () => ({
  getProducts: jest.fn(async () => []),
}));

import React from "react";
import fs from "node:fs";
import path from "node:path";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import type { Product } from "../api";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");

const product = (over: Partial<Product> = {}): Product => ({
  id: 1,
  name: "E L I F OK УНИВЕРСАЛ 72% 1 L",
  code: "A53",
  barcode: "4780000000001",
  category: "Бытовая химия",
  unitPrice: "9500",
  available: "5",
  unit: "pcs",
  photoUrl: null,
  packSize: "12.00",
  packLabel: "блок",
  unitWeight: "1.100",
  description: "Универсальное средство, подходит для любых поверхностей.",
  ...over,
});

const getProducts = api.getProducts as jest.Mock;

async function show(over: Partial<Product> = {}) {
  getProducts.mockResolvedValue([product(over)]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Screen = require("../../app/product/[id]").default;
  render(<QueryClientProvider client={qc}><Screen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText(product(over).name)).toBeTruthy());
}

// Первый require экрана на полном наборе занимает секунды (шрифты, иконки,
// навигация под нагрузкой других воркеров): греем модуль до тестов, иначе
// первый из них упирался в 5-секундный предел jest.
beforeAll(() => { require("../../app/product/[id]"); }, 30_000);

beforeEach(() => {
  mockPush.mockReset(); mockBack.mockReset();
  mockRouteParams = { id: "1" };
  getProducts.mockReset();
});

describe("кнопку видно при любом содержимом", () => {
  it("количество и кнопка стоят после прокручиваемой части, а не внутри неё", () => {
    const src = read("app/product/[id].tsx");
    const scrollEnds = src.indexOf("</ScrollView>");
    const button = src.indexOf('t(`В заказ · ');
    expect(scrollEnds).toBeGreaterThan(0); // прокрутка на экране товара пропала
    expect(button).toBeGreaterThan(0); // кнопка заказа пропала
    expect(scrollEnds).toBeLessThan(button);
    // Низ отбит от системной панели тем же помощником, что и остальные экраны.
    expect(src.slice(scrollEnds)).toContain("safeBottomPadding(insets.bottom)");
  });
});

describe("нулевой остаток", () => {
  it("кнопка говорит «Нет в наличии» и никуда не ведёт", async () => {
    await show({ available: "0" });
    // Дважды: значок на фотографии и сама кнопка. Ждём, а не берём сразу:
    // на полном наборе имя товара успевало отрисоваться раньше остатка.
    await waitFor(() => expect(screen.getAllByText("Нет в наличии")).toHaveLength(2));
    const labels = screen.getAllByText("Нет в наличии");
    expect(screen.queryByText(/В заказ/)).toBeNull();
    fireEvent.click(labels[labels.length - 1]);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("остаток есть", () => {
  it("«плюс» считает до остатка и не выше, итог на кнопке растёт", async () => {
    await show({ available: "2" });
    const plus = screen.getByLabelText("Больше");
    expect(screen.getByText(/В заказ · 9 500/)).toBeTruthy();
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(screen.getByTestId("qty").textContent).toBe("2");
    expect(screen.getByText(/В заказ · 19 000/)).toBeTruthy();
  });

  it("выбранное количество уезжает на экран нового заказа", async () => {
    await show({ available: "5" });
    fireEvent.click(screen.getByLabelText("Больше"));
    fireEvent.click(screen.getByLabelText("Больше"));
    fireEvent.click(screen.getByText(/В заказ/));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toEqual({
      pathname: "/order/new",
      params: { productId: "1", productName: product().name, productPrice: "9500", productQty: "3" },
    });
  });
});

describe("сведения с сервера напечатаны", () => {
  it("штрих-код, категория, упаковка, вес, описание", async () => {
    await show();
    expect(screen.getByText("4780000000001")).toBeTruthy();
    expect(screen.getAllByText(/Бытовая химия/).length).toBeGreaterThan(0);
    expect(screen.getByText("12 шт · блок")).toBeTruthy();
    expect(screen.getByText("1,1 кг")).toBeTruthy();
    expect(screen.getByText("Универсальное средство, подходит для любых поверхностей.")).toBeTruthy();
  });

  it("пустые поля не печатают пустых строк", async () => {
    await show({ code: undefined, barcode: null, category: undefined, packSize: null, unitWeight: "0.000", description: null });
    expect(screen.queryByText("Штрих-код")).toBeNull();
    expect(screen.queryByText("Упаковка")).toBeNull();
    expect(screen.queryByText("ОПИСАНИЕ")).toBeNull();
    expect(screen.getByText("Сведения о товаре не заполнены")).toBeTruthy();
  });
});

describe("без связи", () => {
  it("товар берётся из копии каталога на диске", async () => {
    await AsyncStorage.setItem("cached_products", JSON.stringify([product({ name: "Из кэша" })]));
    getProducts.mockRejectedValue(new Error("Network request failed"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const Screen = require("../../app/product/[id]").default;
    await act(async () => {
      render(<QueryClientProvider client={qc}><Screen /></QueryClientProvider>);
    });
    await waitFor(() => expect(screen.getByText("Из кэша")).toBeTruthy());
    await AsyncStorage.removeItem("cached_products");
  });
});

describe("проводка", () => {
  it("каталог ведёт на экран товара, старый лист не вернулся", () => {
    const src = read("app/(tabs)/catalog.tsx");
    expect(src).toContain("router.push(`/product/${item.id}`)");
    expect(src).not.toContain("ProductDetail");
  });

  it("маршрут заявлен без системной шапки", () => {
    expect(read("app/_layout.tsx")).toContain('<Stack.Screen name="product/[id]" options={{ headerShown: false }} />');
  });

  it("новый заказ читает количество из параметров", () => {
    const src = read("app/order/new.tsx");
    expect(src).toContain("productQty?: string");
    expect(src).toContain("Number(params.productQty)");
  });

  it("строка сведений живёт в ui.tsx одна на магазин и товар", () => {
    expect(read("src/components/ui.tsx")).toContain("export function InfoRow(");
    expect(read("app/shop/[id].tsx")).not.toContain("function InfoRow(");
    expect(read("app/product/[id].tsx")).toContain("InfoRow");
  });
});
