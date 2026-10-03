/**
 * Экран долгов не открывается тем, кому сервер его не отдаст.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Снимки для App Store, 03.10.2026: агент, попавший на /debtors (вкладки нет,
 * но адрес есть), видел пустые нули, четыре корзины и «Не загрузилось ·
 * Insufficient permissions». Запрос уходил, сервер отказывал по роли, экран
 * печатал отказ. Пользоваться экраном агент всё равно не может.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящий экран app/(tabs)/debtors.tsx:
 *   · агент, курьер, мерчендайзер уходят на главную, и запрос НЕ уходит;
 *   · супервайзер, владелец, оператор видят экран, и запрос уходит;
 *   · правило то же, что у сервера (managementQuery): canSeeDebtors.
 *
 * Нарочная поломка: убрать из экрана `if (!allowed) return <Redirect …/>` —
 * падает первая проверка; убрать `enabled: allowed` — она же, на запросе.
 */
const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => { mockRedirect(props.href); return null; },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock("../api", () => ({ getReceivablesAging: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { canSeeDebtors } from "../lib/tabs";

const api = require("../api");
const DebtorsScreen = require("../../app/(tabs)/debtors").default;

function show(role: string) {
  useAuthStore.setState({ user: { id: 1, name: "Тест", role } as never });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}><DebtorsScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockRedirect.mockReset();
  api.getReceivablesAging.mockReset();
  api.getReceivablesAging.mockResolvedValue({ totalDebt: 0, buckets: { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 0 }, unattributed: 0, debtorCount: 0, shops: [] });
});

describe("кому сервер откажет — экран не открывается", () => {
  it.each(["agent", "courier", "merchandiser"])("%s уходит на главную, запрос не уходит", async (role) => {
    show(role);
    expect(mockRedirect).toHaveBeenCalledWith("/");
    expect(screen.queryByText("Долги магазинов")).toBeNull();
    await new Promise(r => setTimeout(r, 20));
    expect(api.getReceivablesAging).not.toHaveBeenCalled();
  });
});

describe("надзорным ролям — экран и запрос", () => {
  it.each(["supervisor", "ceo", "operator"])("%s видит экран", async (role) => {
    show(role);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("Долги магазинов")).toBeTruthy();
    await waitFor(() => expect(api.getReceivablesAging).toHaveBeenCalled());
  });
});

describe("правило — то же, что у сервера", () => {
  it("managementQuery: владелец, оператор, супервайзер", () => {
    expect(["ceo", "operator", "supervisor"].every(canSeeDebtors)).toBe(true);
    expect(["agent", "courier", "merchandiser", undefined].some(r => canSeeDebtors(r))).toBe(false);
  });
});
