import { DarkColors, LightColors, Typography, Spacing, Radii, Timing } from '../theme';

describe('Theme', () => {
  it('DarkColors should have primary background', () => {
    expect(DarkColors.bg.primary).toBe('#1c1a17');
  });

  it('LightColors should have primary background', () => {
    expect(LightColors.bg.primary).toBe('#e8e6e1');
  });

  it('Typography should define font sizes', () => {
    expect(Typography.size.xs).toBe(11);
    expect(Typography.size.base).toBe(14);
    expect(Typography.size.xxl).toBe(24);
  });

  it('Spacing should define scale values', () => {
    expect(Spacing.xs).toBe(4);
    expect(Spacing.sm).toBe(8);
    expect(Spacing.lg).toBe(16);
  });

  it('Radii should define border radius values', () => {
    expect(Radii.sm).toBe(10);
    expect(Radii.md).toBe(12);
    expect(Radii.full).toBe(999);
  });

  it('Timing should define animation durations', () => {
    expect(Timing.fast).toBe(150);
    expect(Timing.normal).toBe(250);
    expect(Timing.slow).toBe(400);
  });
});
