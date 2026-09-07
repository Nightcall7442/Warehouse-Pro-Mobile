/**
 * «Нормы нет» и «норма не доехала» — разные вещи.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Ошибка гасилась в самом запросе: `getMyQuota().catch(() => null)`. Дальше
 * null означал «нормы нет», и агент в поле читал «Норма на этот месяц не
 * назначена. Её ставит супервайзер» — хотя норма назначена и просто не
 * загрузилась. Он шёл выяснять к супервайзеру то, что чинится повтором.
 *
 * Ловушка при починке: когда нормы действительно нет, сервер отвечает пустотой
 * (`if (!target) return null` в sales-target-router). Раньше разбор ответа в
 * api.ts превращал эту пустоту в ошибку, и карточка отличала одно от другого
 * сравнением текста сообщения. Теперь пустота доезжает сюда как null — а
 * проверка нужна та же: обе ветки по-прежнему не видны по типам.
 */
jest.mock("../store/theme", () => ({
  useThemeColors: () => ({
    bg: { card: "#fff", elevated: "#f0f0f0", input: "#e0e0e0", primary: "#000" },
    text: { primary: "#000", secondary: "#666", muted: "#999", tertiary: "#888" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0", primaryDim: "#e8edf8", primaryLight: "#5b8cf0", ink: "#fff" },
    accent: { primary: "#3b6fe0", success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
    status: {
      success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0",
      successDim: "#e8f8f0", warningDim: "#fdf0e0", dangerDim: "#fde8e8", infoDim: "#e8edf8",
    },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("../api", () => ({ getMyQuota: jest.fn() }));

import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MonthlyPlanCard } from "../components/MonthlyPlanCard";
import { getMyQuota } from "../api";

const mockedQuota = getMyQuota as jest.MockedFunction<typeof getMyQuota>;

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MonthlyPlanCard />
    </QueryClientProvider>
  );
}

describe("MonthlyPlanCard", () => {
  beforeEach(() => mockedQuota.mockReset());

  it("сбой связи назван сбоем, а не отсутствующей нормой", async () => {
    mockedQuota.mockRejectedValue(new Error("Network Error"));
    renderCard();

    expect(await screen.findByText("Не удалось загрузить норму месяца")).toBeTruthy();
    expect(screen.queryByText("Норма на этот месяц не назначена")).toBeNull();
  });

  it("пустой ответ сервера остаётся «норма не назначена»", async () => {
    // Ровно то, что доезжает от сервера, когда норму не ставили.
    mockedQuota.mockResolvedValue(null);
    renderCard();

    expect(await screen.findByText("Норма на этот месяц не назначена")).toBeTruthy();
    expect(screen.queryByText("Не удалось загрузить норму месяца")).toBeNull();
  });
});
