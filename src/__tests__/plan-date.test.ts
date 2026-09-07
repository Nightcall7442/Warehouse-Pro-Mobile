/**
 * День плана — по местному календарю, а не по Гринвичу.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * fmtDate собирал строку через toISOString, то есть переводил время в UTC. В
 * Ташкенте (+5) с полуночи до пяти утра над списком стояло «7 сентября», а
 * планы запрашивались за 6-е: супервайзер, раздающий маршруты рано утром,
 * назначал визиты на вчера, и агент их у себя не видел.
 *
 * Проверка сравнивает результат с местной датой того же объекта. В часовом
 * поясе UTC она проходит при любой реализации — но у пользователей пояс +5,
 * и там прежний код на этих же данных даёт день назад.
 */
jest.mock("../store/theme", () => ({
  useThemeColors: () => ({
    bg: { card: "#fff", elevated: "#f0f0f0" },
    text: { primary: "#000", muted: "#999" },
    border: { default: "#ddd" },
    brand: { primary: "#3b6fe0" },
    accent: { primary: "#3b6fe0" },
    status: { success: "#34c473" },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

import { fmtDate } from "../components/plans/PlanHelpers";

describe("fmtDate", () => {
  it("берёт местный день, а не гринвичский", () => {
    // Половина первого ночи — тот час, в который два календаря расходятся.
    const nightly = new Date(2026, 8, 7, 0, 30);
    expect(fmtDate(nightly)).toBe("2026-09-07");
  });

  it("день не съезжает и поздним вечером", () => {
    const evening = new Date(2026, 8, 7, 23, 45);
    expect(fmtDate(evening)).toBe("2026-09-07");
  });
});
