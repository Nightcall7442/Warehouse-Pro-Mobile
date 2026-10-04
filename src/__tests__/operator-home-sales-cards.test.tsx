/**
 * Главная оператора: без пустых графиков и без запросов, которые сервер отвергнет.
 *
 * Оператор открывает ту же главную, что директор и супервайзер, а сводку
 * продаж — динамику, статусы заказов, последние заказы — сервер отдаёт только
 * им двоим (dashboard.* — supervisorQuery). У оператора были три пустые
 * карточки и три отказа 403 на каждое открытие. Владелец: «убрать, если они
 * пустые».
 *
 * Правило одно — canSeeSalesDashboard (lib/tabs.ts); здесь проверяется, что
 * главная ему подчиняется: нет карточек и нет запросов у оператора, есть — у
 * директора и супервайзера.
 *
 * Нарочная поломка: убрать enabled у запросов — «оператор не спрашивает»;
 * убрать условие вокруг карточек — «оператор не видит».
 */
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => mockRouter,
  router: mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- настоящий зовёт раз на фокус
    useEffect(() => cb(), []);
  },
}));
jest.mock("../api", () => {
  const fns: Record<string, jest.Mock> = {};
  return new Proxy(fns, {
    get(target, name: string) {
      if (name === "__esModule") return true;
      if (!target[name]) target[name] = jest.fn(async () => []);
      return target[name];
    },
  });
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("react-native-webview", () => ({ WebView: "WebView" }));
jest.mock("../components/YandexMapView", () => ({ __esModule: true, default: () => null, centerOnAgent: jest.fn(), fitAllMarkers: jest.fn() }));

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { useLangStore } from "../i18n";
import { canSeeSalesDashboard } from "../lib/tabs";

const api = require("../api");
const SALES = ["getDashboardTrends", "getDashboardStatusBreakdown", "getDashboardActivity"] as const;
const TITLES = ["Динамика продаж", "Статусы заказов", "Последние заказы"];

function showHome(role: string) {
  useAuthStore.setState({ user: { id: 7, name: "Тест Тестов", role } as never, isLoading: false } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Home = require("../../app/(tabs)/index").default;
  return render(<QueryClientProvider client={client}><Home /></QueryClientProvider>);
}

// Первый require главной — секунды (шрифты, графики): греем до тестов.
beforeAll(() => { require("../../app/(tabs)/index"); }, 60_000);

beforeEach(() => {
  useLangStore.setState({ lang: "ru" });
  for (const fn of SALES) api[fn].mockClear();
  api.getSmartAlerts.mockClear();
});

describe("сводка продаж на главной — по роли", () => {
  it("правило: директор и супервайзер — да, оператор и остальные — нет", () => {
    expect(canSeeSalesDashboard("ceo")).toBe(true);
    expect(canSeeSalesDashboard("supervisor")).toBe(true);
    for (const role of ["operator", "agent", "courier", "merchandiser", undefined]) expect(canSeeSalesDashboard(role)).toBe(false);
  });

  it("оператор не видит пустых карточек сводки", async () => {
    showHome("operator");
    // Главная оператора отрисована: её собственные запросы ушли.
    await waitFor(() => expect(api.getSmartAlerts).toHaveBeenCalled());
    for (const title of TITLES) expect(screen.queryByText(title)).toBeNull();
  });

  it("оператор не спрашивает то, что сервер ему не отдаст", async () => {
    showHome("operator");
    await waitFor(() => expect(api.getSmartAlerts).toHaveBeenCalled());
    for (const fn of SALES) expect(api[fn]).not.toHaveBeenCalled();
  });

  it.each(["ceo", "supervisor"])("%s видит сводку и спрашивает её", async (role) => {
    showHome(role);
    for (const title of TITLES) expect(await screen.findByText(title)).toBeTruthy();
    for (const fn of SALES) await waitFor(() => expect(api[fn]).toHaveBeenCalled());
  });
});
