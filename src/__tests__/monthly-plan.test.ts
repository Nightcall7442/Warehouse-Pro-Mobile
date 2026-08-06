jest.mock("../api", () => ({ getMyQuota: jest.fn() }));
jest.mock("../store/theme", () => ({ useThemeColors: () => ({}) }));
jest.mock("../components/Animated", () => ({ ShimmerSkeleton: () => null }));

import { computePace } from "../lib/monthly-plan";
import type { MyQuota } from "../api";

/**
 * The pace verdict is the whole point of the card: a bare percentage can't tell
 * an agent whether their month is going well, because the same number means
 * opposite things on day 5 and day 25. If this logic is wrong the card is
 * actively misleading — it would reassure someone who is behind.
 */
function quota(over: {
  actual: number;
  target: number;
  daysElapsed: number;
  daysTotal?: number;
}): MyQuota {
  const daysTotal = over.daysTotal ?? 30;
  const pct = over.target > 0 ? Math.min(100, Math.round((over.actual / over.target) * 100)) : 0;
  return {
    revenue: { target: over.target, actual: over.actual, pct },
    orders: { target: 0, actual: 0, pct: 0 },
    visits: { target: 0, actual: 0, pct: 0 },
    month: "2026-08-01",
    daysTotal,
    daysElapsed: over.daysElapsed,
  };
}

describe("computePace", () => {
  it("expects a straight line through the month", () => {
    expect(computePace(quota({ actual: 0, target: 100, daysElapsed: 10 })).expectedPct).toBe(33);
    expect(computePace(quota({ actual: 0, target: 100, daysElapsed: 15 })).expectedPct).toBe(50);
    expect(computePace(quota({ actual: 0, target: 100, daysElapsed: 30 })).expectedPct).toBe(100);
  });

  // The case that makes the card worth building: identical progress, opposite
  // verdicts, because the calendar moved underneath it.
  it("reads the same 60% as ahead early and behind late", () => {
    expect(computePace(quota({ actual: 60, target: 100, daysElapsed: 5 })).status).toBe("ahead");
    expect(computePace(quota({ actual: 60, target: 100, daysElapsed: 27 })).status).toBe("behind");
  });

  it("does not cry wolf over small wobbles", () => {
    // Orders arrive in lumps; a couple of points either way is noise, and an
    // indicator that flashes red every other day stops being read at all.
    expect(computePace(quota({ actual: 48, target: 100, daysElapsed: 15 })).status).toBe("onTrack");
    expect(computePace(quota({ actual: 53, target: 100, daysElapsed: 15 })).status).toBe("onTrack");
  });

  it("calls the plan done once the money is in, whatever the date", () => {
    const early = computePace(quota({ actual: 100, target: 100, daysElapsed: 3 }));
    expect(early.status).toBe("done");
    expect(early.remaining).toBe(0);
  });

  it("treats overshoot as done rather than as negative work left", () => {
    const over = computePace(quota({ actual: 150, target: 100, daysElapsed: 20 }));
    expect(over.status).toBe("done");
    expect(over.remaining).toBe(0);
  });

  it("spreads what is left across the days that remain", () => {
    const p = computePace(quota({ actual: 40_000_000, target: 100_000_000, daysElapsed: 20 }));
    expect(p.daysLeft).toBe(10);
    expect(p.remaining).toBe(60_000_000);
    expect(p.perDay).toBe(6_000_000);
  });

  // Dividing by the days left is the obvious way to write this and produces
  // Infinity on the last day of the month — printed straight onto the card.
  it("does not divide by zero on the final day", () => {
    const p = computePace(quota({ actual: 10, target: 100, daysElapsed: 30 }));
    expect(p.daysLeft).toBe(0);
    expect(Number.isFinite(p.perDay)).toBe(true);
    expect(p.perDay).toBe(90);
  });

  it("survives a month with no revenue target set", () => {
    const p = computePace(quota({ actual: 0, target: 0, daysElapsed: 10 }));
    expect(p.status).toBe("done");
    expect(Number.isFinite(p.perDay)).toBe(true);
  });

  it("handles a 28-day month without drifting", () => {
    const p = computePace(quota({ actual: 50, target: 100, daysElapsed: 14, daysTotal: 28 }));
    expect(p.expectedPct).toBe(50);
    expect(p.status).toBe("onTrack");
    expect(p.daysLeft).toBe(14);
  });
});
