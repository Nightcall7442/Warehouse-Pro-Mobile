/**
 * Последнее нажатое уведомление в вебе не спрашивается.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * На каждой загрузке веб-сборки (стенд, снимки для App Store) в консоль
 * падало «ExpoNotifications.getLastNotificationResponse is not available on
 * web» — необработанный отказ промиса. В вебе нажатых уведомлений не бывает.
 *
 * ── Что проверяется ─────────────────────────────────────────────────────────
 *
 * Настоящий хук usePushNotifications:
 *   · в вебе вызова нет;
 *   · на телефоне он есть, и свежее нажатие по-прежнему ведёт к заказу;
 *   · отказ нативной части не роняет хук необработанным промисом.
 *
 * Нарочная поломка: убрать проверку Platform.OS — падает первая проверка.
 */
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../api", () => ({ registerPushToken: jest.fn(), removePushToken: jest.fn() }));

import { renderHook, waitFor } from "@testing-library/react";
import { Platform } from "react-native";
import { useAuthStore } from "../store/auth";
import { usePushNotifications } from "../hooks/usePushNotifications";

const Notifications = require("expo-notifications");
const { router } = require("expo-router");
const realOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true, user: { id: 1, name: "Агент", role: "agent" } as never });
});
afterEach(() => { (Platform as { OS: string }).OS = realOS; });

const tap = (date: number) => ({ notification: { date, request: { content: { data: { type: "order.delivered", orderId: 42 } } } } });

describe("последнее нажатое уведомление", () => {
  it("в вебе не спрашивается вовсе", async () => {
    (Platform as { OS: string }).OS = "web";
    Notifications.getLastNotificationResponseAsync.mockRejectedValue(new Error("not available on web"));
    renderHook(() => usePushNotifications());
    await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
    expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
  });

  it("на телефоне спрашивается, и свежее нажатие открывает заказ", async () => {
    (Platform as { OS: string }).OS = "ios";
    Notifications.getLastNotificationResponseAsync.mockResolvedValue(tap(Date.now()));
    renderHook(() => usePushNotifications());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/order/42"));
  });

  it("отказ нативной части не оставляет необработанного промиса", async () => {
    (Platform as { OS: string }).OS = "android";
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    Notifications.getLastNotificationResponseAsync.mockRejectedValue(new Error("native module missing"));
    renderHook(() => usePushNotifications());
    await waitFor(() => expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
