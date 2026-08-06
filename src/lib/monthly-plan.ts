import type { MyQuota } from "../api";

/**
 * Pace maths for the monthly plan card.
 *
 * Kept out of the component file so it can be tested directly, and so that
 * exporting it doesn't cost the card its fast refresh.
 */

/** Money the agent recognises: 12 400 000 → "12,4 млн". */
export function money(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")} млрд`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс`;
  return Math.round(n).toLocaleString("ru");
}

interface Pace {
  /** Where the month expects them to be by now, 0–100. */
  expectedPct: number;
  /** Signed distance from that expectation, in percentage points. */
  deltaPts: number;
  daysLeft: number;
  /** Money still owed on the plan. */
  remaining: number;
  /** What that comes to per remaining day. */
  perDay: number;
  status: "ahead" | "onTrack" | "behind" | "done";
}

export function computePace(quota: MyQuota): Pace {
  const { daysTotal, daysElapsed } = quota;
  const daysLeft = Math.max(0, daysTotal - daysElapsed);
  const remaining = Math.max(0, quota.revenue.target - quota.revenue.actual);

  // Straight-line expectation: by day 10 of 30 you should be a third of the way.
  const expectedPct = daysTotal > 0 ? Math.round((daysElapsed / daysTotal) * 100) : 0;
  const deltaPts = quota.revenue.pct - expectedPct;

  const status: Pace["status"] =
    remaining === 0 ? "done"
      // A few points either side of the line is noise, not a verdict — orders
      // land in lumps, and flagging every wobble as "behind" teaches agents to
      // ignore the indicator entirely.
      : deltaPts >= 5 ? "ahead"
        : deltaPts <= -10 ? "behind"
          : "onTrack";

  return {
    expectedPct,
    deltaPts,
    daysLeft,
    remaining,
    // With no days left the plan can't be spread any further; the shortfall is
    // simply what it is, and dividing by zero would print Infinity.
    perDay: daysLeft > 0 ? remaining / daysLeft : remaining,
    status,
  };
}
