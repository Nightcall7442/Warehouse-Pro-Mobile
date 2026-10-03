/**
 * Главная: объявления платформы и карточка «Трекинг».
 *
 * ── Объявления (веб #154) ───────────────────────────────────────────────────
 *
 * Владелец платформы пишет «в субботу ночью обновление» — на вебе это полоса
 * вверху, а агенты, курьеры и мерчендайзеры веб не открывают: до них оно не
 * доходило. Теперь — карточка на главной у каждой роли:
 *   · текст и уровень — ровно из ответа announcement.active; узбекский — если
 *     у объявления есть оба поля;
 *   · крестик прячет сразу и зовёт announcement.dismiss; закрытие не дошло —
 *     уйдёт снова, когда сервер опять пришлёт это объявление;
 *   · без связи — ни карточки, ни ошибки.
 *
 * ── «Трекинг» у оператора ──────────────────────────────────────────────────
 *
 * Карточка открывала карту, которую сервер оператору не отдаёт
 * (agent.getLocations — supervisorQuery: ceo и супервайзер). Теперь она по
 * тому же правилу, что вкладка (canSeeAgentMap), а экран карты уводит
 * остальных на главную до запроса.
 *
 * Нарочные поломки (перечислены в PR): убрать `q.isError` из условия —
 * падает «без связи»; убрать canSeeAgentMap у карточки — падает «оператор»;
 * убрать Redirect с экрана карты — падает «прямой адрес».
 */
const mockRedirect = jest.fn();
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => { mockRedirect(props.href); return null; },
  useRouter: () => mockRouter,
  router: mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- настоящий зовёт раз на фокус
    useEffect(() => cb(), []);
  },
}));
// Главная зовёт десяток ручек; здесь важны две. Остальные — пустой ответ.
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
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { useLangStore } from "../i18n";
import { Announcements } from "../components/Announcements";
import { localizedAnnouncement } from "../lib/announcement-text";

const api = require("../api");

const UPDATE = { id: 11, level: "info", title: "Обновление в субботу", body: "С 02:00 до 03:00 приложение недоступно.", titleUz: "Shanba kuni yangilanish", bodyUz: "02:00 dan 03:00 gacha ilova ishlamaydi." };
const DEBT = { id: 12, level: "warning", title: "Оплата тарифа", body: "Срок оплаты — 10 октября.", titleUz: null, bodyUz: null };

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const asRole = (role: string) => useAuthStore.setState({ user: { id: 7, name: "Тест Тестов", role } as never, isLoading: false } as never);

beforeEach(() => {
  mockRedirect.mockReset();
  api.getActiveAnnouncements.mockReset();
  api.dismissAnnouncement.mockReset();
  api.getAgentLocations.mockReset();
  api.getActiveAnnouncements.mockResolvedValue([UPDATE, DEBT]);
  api.dismissAnnouncement.mockResolvedValue({ ok: true });
  api.getAgentLocations.mockResolvedValue([]);
  useLangStore.setState({ lang: "ru" });
});

describe("объявления платформы", () => {
  it("текст и уровень — из ответа сервера", async () => {
    asRole("agent");
    withClient(<Announcements />);
    expect(await screen.findByText("Обновление в субботу")).toBeTruthy();
    expect(screen.getByText("С 02:00 до 03:00 приложение недоступно.")).toBeTruthy();
    expect(screen.getByText("Оплата тарифа")).toBeTruthy();
    const icon = (id: number) => screen.getByTestId(`announcement-icon-${id}`).querySelector("Feather")?.getAttribute("name");
    expect(icon(11)).toBe("info");
    expect(icon(12)).toBe("alert-triangle");
  });

  it("по-узбекски — если у объявления есть оба поля, иначе русский", async () => {
    useLangStore.setState({ lang: "uz" });
    asRole("courier");
    withClient(<Announcements />);
    expect(await screen.findByText("Shanba kuni yangilanish")).toBeTruthy();
    expect(screen.getByText("Оплата тарифа")).toBeTruthy();
    expect(localizedAnnouncement({ ...DEBT, titleUz: "Faqat sarlavha" }, "uz").title).toBe("Оплата тарифа");
  });

  it("крестик прячет сразу и закрывает на сервере", async () => {
    asRole("agent");
    withClient(<Announcements />);
    const close = await screen.findByTestId("announcement-close-11");
    expect(close.getAttribute("aria-label")).toBe("Закрыть объявление");
    await act(async () => { fireEvent.click(close); });
    expect(screen.queryByText("Обновление в субботу")).toBeNull();
    expect(screen.getByText("Оплата тарифа")).toBeTruthy();
    expect(api.dismissAnnouncement).toHaveBeenCalledWith(11);
  });

  it("закрытие не дошло — уходит снова, когда сервер опять присылает объявление", async () => {
    asRole("agent");
    api.dismissAnnouncement.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValue({ ok: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><Announcements /></QueryClientProvider>);
    await act(async () => { fireEvent.click(await screen.findByTestId("announcement-close-11")); });
    await waitFor(() => expect(api.dismissAnnouncement.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("Обновление в субботу")).toBeNull();
    const calls = api.dismissAnnouncement.mock.calls.length;
    await act(async () => { await client.refetchQueries({ queryKey: ["announcements"] }); });
    // Дошло — больше не повторяется.
    expect(api.dismissAnnouncement.mock.calls.length).toBe(calls);
  });

  it("без связи — ни карточки, ни ошибки; связь пропала — прежние карточки уходят", async () => {
    asRole("agent");
    api.getActiveAnnouncements.mockRejectedValue(new Error("Network Error"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={client}><Announcements /></QueryClientProvider>);
    await waitFor(() => expect(api.getActiveAnnouncements).toHaveBeenCalled());
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(container.textContent).toBe("");

    // Связь появилась — объявление пришло.
    api.getActiveAnnouncements.mockResolvedValue([UPDATE]);
    await act(async () => { await client.refetchQueries({ queryKey: ["announcements"] }); });
    expect(await screen.findByText("Обновление в субботу")).toBeTruthy();

    // Пропала снова: вчерашнее «завтра обновление» не висит, пока не спросим сервер.
    api.getActiveAnnouncements.mockRejectedValue(new Error("Network Error"));
    await act(async () => { await client.refetchQueries({ queryKey: ["announcements"] }); });
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("не больше трёх", async () => {
    asRole("agent");
    api.getActiveAnnouncements.mockResolvedValue([1, 2, 3, 4, 5].map(id => ({ ...DEBT, id, title: `Объявление ${id}` })));
    withClient(<Announcements />);
    await screen.findByText("Объявление 1");
    expect(screen.queryByText("Объявление 4")).toBeNull();
  });

  it.each(["agent", "merchandiser", "supervisor", "ceo", "operator", "courier"])("на главной у роли %s", async (role) => {
    asRole(role);
    const Home = require("../../app/(tabs)/index").default;
    withClient(<Home />);
    expect(await screen.findByTestId("announcement-11")).toBeTruthy();
  });
});

describe("карточка «Трекинг» и экран карты", () => {
  it("оператор карточки не видит — сервер карту ему не отдаёт", async () => {
    asRole("operator");
    const Home = require("../../app/(tabs)/index").default;
    withClient(<Home />);
    expect(await screen.findByText("ПЛАНЫ")).toBeTruthy();
    expect(screen.queryByText("Трекинг")).toBeNull();
  });

  it.each(["supervisor", "ceo"])("%s видит", async (role) => {
    asRole(role);
    const Home = require("../../app/(tabs)/index").default;
    withClient(<Home />);
    expect(await screen.findByText("Трекинг")).toBeTruthy();
  });

  it("прямой адрес карты: оператор уходит на главную, запрос не уходит", async () => {
    asRole("operator");
    const Tracking = require("../../app/(tabs)/tracking").default;
    withClient(<Tracking />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(api.getAgentLocations).not.toHaveBeenCalled();
  });

  it("супервайзеру карта открывается", async () => {
    asRole("supervisor");
    const Tracking = require("../../app/(tabs)/tracking").default;
    withClient(<Tracking />);
    await waitFor(() => expect(api.getAgentLocations).toHaveBeenCalled());
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
