// Warehouse Pro — Theme contrast tests
import { describe, it, expect } from "vitest";
import { DarkColors, LightColors } from "../theme";

describe("Theme Contrast", () => {
  // Helper to calculate relative luminance
  function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const adjust = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
  }

  function contrastRatio(hex1: string, hex2: string): number {
    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  it("dark mode text has sufficient contrast on background", () => {
    const ratio = contrastRatio(DarkColors.text.primary, DarkColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA
  });

  it("light mode text has sufficient contrast on background", () => {
    const ratio = contrastRatio(LightColors.text.primary, LightColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("dark mode primary button text has sufficient contrast", () => {
    const ratio = contrastRatio("#ffffff", DarkColors.accent.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0); // Large text minimum
  });

  it("light mode primary button text has sufficient contrast", () => {
    const ratio = contrastRatio("#ffffff", LightColors.accent.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("dark mode secondary text is readable", () => {
    const ratio = contrastRatio(DarkColors.text.secondary, DarkColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("light mode secondary text is readable", () => {
    const ratio = contrastRatio(LightColors.text.secondary, LightColors.bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });
});
