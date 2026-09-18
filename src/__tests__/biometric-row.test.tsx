/**
 * Переключатель «Вход по отпечатку и блокировка» — дверь к тому, что уже
 * было написано и протестировано, но недостижимо: enrollBiometric не
 * вызывался нигде, кнопка отпечатка на входе и экран блокировки не
 * включались никогда.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import * as LocalAuthentication from "expo-local-authentication";

const mockStore: Record<string, string> = {};
jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));
let mockHasHardware = true, mockIsEnrolled = true;
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => mockHasHardware),
  isEnrolledAsync: jest.fn(async () => mockIsEnrolled),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

import { BiometricRow } from "../components/BiometricRow";
import { LightColors } from "../theme";

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; mockHasHardware = true; mockIsEnrolled = true; });

describe("BiometricRow", () => {
  it("включение спрашивает отпечаток и запоминает флаг; выключение стирает", async () => {
    render(<BiometricRow colors={LightColors} isDark={false} />);
    const sw = await screen.findByLabelText("Вход по отпечатку");
    fireEvent.click(sw);
    await waitFor(() => expect(mockStore["biometric_enabled"]).toBe("true"));
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
    fireEvent.click(sw);
    await waitFor(() => expect(mockStore["biometric_enabled"]).toBeUndefined());
  });

  it("отказ в подтверждении — флаг не ставится", async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValueOnce({ success: false, error: "user_cancel" });
    render(<BiometricRow colors={LightColors} isDark={false} />);
    fireEvent.click(await screen.findByLabelText("Вход по отпечатку"));
    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled());
    expect(mockStore["biometric_enabled"]).toBeUndefined();
  });

  it("без датчика или без заведённого отпечатка строки нет", async () => {
    mockIsEnrolled = false;
    render(<BiometricRow colors={LightColors} isDark={false} />);
    await waitFor(() => expect(LocalAuthentication.isEnrolledAsync).toHaveBeenCalled());
    expect(screen.queryByLabelText("Вход по отпечатку")).toBeNull();
  });

  it("стоит в профиле", () => {
    expect(readFileSync("app/(tabs)/profile.tsx", "utf8")).toContain("<BiometricRow colors={colors} isDark={isDark} />");
  });

  it("замок — в собственном системном окне, выше любых открытых модальных", () => {
    // Абсолютный View накрывал только экраны навигатора; RN <Modal> — отдельное
    // окно системы, и открытый лист товара с ценами стоял поверх «замка».
    const src = readFileSync("src/components/LockScreen.tsx", "utf8");
    expect(src).toMatch(/<Modal visible transparent=\{false\}/);
    expect(src).not.toContain("zIndex: 999");
  });
});
