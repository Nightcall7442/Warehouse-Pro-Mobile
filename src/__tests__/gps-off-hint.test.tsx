/**
 * «Геолокация выключена» над списком планов.
 *
 * Без разрешения визиты отмечались молча: точек нет, на карте у начальника
 * агента нет, проверка на подлог пишет визиты в подозрительные — с вычетом
 * из зарплаты. Агент узнавал об этом из зарплатной ведомости.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Linking } from "react-native";
import * as Location from "expo-location";
import { readFileSync } from "node:fs";
import { GpsOffHint } from "../components/plans/GpsOffHint";
import { LightColors } from "../theme";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("expo-router", () => ({
  // useFocusEffect в тесте — обычный эффект при монтировании.
  useFocusEffect: (cb: () => void | (() => void)) => { const { useEffect } = require("react"); useEffect(cb, [cb]); },
}));

const perm = Location.getForegroundPermissionsAsync as jest.Mock;

describe("GpsOffHint", () => {
  it("разрешения нет — подсказка видна и ведёт в настройки", async () => {
    perm.mockResolvedValueOnce({ status: "denied" });
    // В jsdom у Linking нет openSettings (react-native-web); на телефоне есть.
    const open = jest.fn(async () => {});
    (Linking as unknown as { openSettings?: () => Promise<void> }).openSettings = open;
    render(<GpsOffHint colors={LightColors} />);
    const hint = await screen.findByText(/Геолокация выключена/);
    fireEvent.click(hint);
    expect(open).toHaveBeenCalled();
  });

  it("разрешение есть — ничего не рисуется и НЕ запрашивается", async () => {
    perm.mockResolvedValueOnce({ status: "granted" });
    const ask = Location.requestForegroundPermissionsAsync as jest.Mock;
    render(<GpsOffHint colors={LightColors} />);
    await waitFor(() => expect(perm).toHaveBeenCalled());
    expect(screen.queryByText(/Геолокация выключена/)).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it("стоит над списком планов на обоих экранах", () => {
    for (const f of ["src/components/plans/AgentPlansView.tsx", "app/(tabs)/plan.tsx"]) {
      expect(readFileSync(f, "utf8")).toContain("<GpsOffHint colors={colors} />");
    }
  });
});
