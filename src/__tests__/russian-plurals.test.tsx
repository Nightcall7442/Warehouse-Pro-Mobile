/**
 * Склонение по числу — одной функцией, а не «один — и всё остальное».
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Экран «Долги магазинов» писал «висит 173 дней» (снимки 04.10.2026): форма
 * выбиралась тернарником «1 — день, меньше пяти — дня, иначе дней», и всё,
 * что больше двадцати, шло во «многих». 21 день, 173 дня, 102 дня — каждая
 * третья строка списка. Тем же самодельным тернарником склоняли ещё четыре
 * места: «21 заказов не отправлены», «2 действий ожидают», «Возврат: 5
 * позиции», «21 товаров», «21 магазинов».
 *
 * Правило в lib/plural.ts есть давно (11–14 — «многих», иначе последняя
 * цифра); здесь проверяется, что экраны склоняют им, а самодельный
 * тернарник по числу в код не вернулся.
 *
 * Узбекский числа не склоняет («173 kundan beri») — там чинить нечего.
 *
 * Нарочная поломка: вернуть в debtors.tsx тернарник `=== 1 ? "день" : … < 5`
 * — падают обе проверки.
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
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import type { ShopAging } from "../api";

const api = require("../api");
const DebtorsScreen = require("../../app/(tabs)/debtors").default;

const shop = (shopId: number, oldestDays: number): ShopAging => ({
  shopId, shopName: `Магазин ${shopId}`, phone: null, agentName: null, debt: 100_000,
  buckets: { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 100_000 }, unattributed: 0, oldestDays,
});

describe("«висит N дней» в долгах магазинов", () => {
  it("173 дня, 21 день, 11 дней, 112 дней, 2 дня, 1 день, 5 дней", async () => {
    const days = [173, 21, 11, 112, 2, 1, 5];
    api.getReceivablesAging.mockResolvedValue({
      totalDebt: 700_000, buckets: { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 700_000 }, unattributed: 0,
      debtorCount: days.length, shops: days.map((d, i) => shop(i + 1, d)),
    });
    useAuthStore.setState({ user: { id: 1, name: "Тест", role: "supervisor" } as never });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={qc}><DebtorsScreen /></QueryClientProvider>);

    for (const text of ["висит 173 дня", "висит 21 день", "висит 11 дней", "висит 112 дней", "висит 2 дня", "висит 1 день", "висит 5 дней"]) {
      expect(await screen.findByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("висит 173 дней")).toBeNull();
  });
});

describe("самодельный тернарник по числу не вернулся", () => {
  const ROOT = process.cwd();
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { if (name !== "__tests__") walk(p, out); }
      else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  };
  // «n === 1 ? "заказ"», «n < 5 ? "а"», «n === 1 ? "" : "ы"» — форма по числу руками.
  const HAND_ROLLED = [
    /(?:===\s*1|<\s*5)\s*\?\s*"[^"\n]*[А-Яа-яЁё]/,
    /===\s*1\s*\?\s*""\s*:\s*"[А-Яа-яЁё]/,
  ];

  it("в app/ и src/ формы по числу выбирает plural()", () => {
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "src"))];
    const found = files.flatMap(f => fs.readFileSync(f, "utf8").split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => HAND_ROLLED.some(re => re.test(line)))
      .map(({ i }) => `${path.relative(ROOT, f)}:${i + 1}`));
    expect(found).toEqual([]);
  });
});
