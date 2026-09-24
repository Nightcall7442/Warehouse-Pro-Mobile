// ──────────────────────────────────────────────────────────────────────────────
// Warehouse Pro — язык оформления v8 (выбор владельца 24.09.2026: «C и D»)
//
// Светлая тема — «Финтех» (вариант C): белые карточки на прохладном
// серо-зелёном холсте, фирменная бирюза знака приложения, главная кнопка —
// жёлтая, как точка в знаке. Тень мягкая и вертикальная, без неоморфных
// бликов.
//
// Тёмная тема — «Полевой» (вариант D): та же, что тёмная в вебе
// (src/index.css), золото вместо коралла, карточки отделены тонкой линией, а
// не тенью. Надписи на золоте — тёмные: белым по золоту контраст ~2:1.
//
// ── Почему не коралл ─────────────────────────────────────────────────────────
//
// v7 держала неоновый коралл, фиолетовые градиенты, «свечение» у зелёного и
// кислотный #00e68a. Рядом со спокойным вебом телефон читался дешёвым и чужим
// (владелец: «мобил как то не серьёзный и дешёвый»). Макеты вариантов —
// артефакт «Мобилка: новые варианты».
//
// ── Два новых токена ─────────────────────────────────────────────────────────
//
// brand.cta / brand.ctaInk — заливка и чернила ГЛАВНОГО действия экрана
// («Новый заказ», «Оформить»): жёлтая в светлой, золотая в тёмной. hero —
// плашка главной цифры экрана (выручка дня): бирюзовая в светлой, карточка в
// тёмной. У арендатора с цветом бренда оба берут его цвет.
// ──────────────────────────────────────────────────────────────────────────────

import { isHexColor } from "./lib/contrast";
import { derivePalette } from "./lib/brand-palette";

/**
 * Пара цветов для LinearGradient.
 *
 * Раньше каждый градиент объявлялся через `as const`, и его тип был не «две
 * строки», а именно «#0099cc и #00b4e6». Пока палитра одна на всех, это
 * незаметно; но цвет арендатора собирает палитру заново, и подставить в такое
 * поле вычисленный цвет нельзя — тип не совпадает. Общий тип снимает запрет и
 * при этом остаётся тем, что ждёт LinearGradient.
 */
type Gradient = readonly [string, string, ...string[]];
const g = (from: string, to: string): Gradient => [from, to];

export const DarkColors = {
  // Холст и поверхности — ровно тёмная тема веба (src/index.css).
  bg: {
    primary: "#1c1a17",
    secondary: "#221f1c",
    card: "#221f1c",
    elevated: "#2a2622",
    input: "#1c1a17",
    overlay: "rgba(28,26,23,0.85)",
    glass: "rgba(34,31,28,0.94)",
    glassCard: "rgba(38,35,32,0.94)",
    overlayDark: "rgba(0,0,0,0.5)",
    glassButton: "rgba(255,255,255,0.08)",
  },
  border: {
    default: "#322e28",
    subtle: "#2a2622",
    strong: "#423d35",
    focus: "#c9a227",
    glass: "rgba(255,255,255,0.08)",
  },
  text: {
    primary: "#ede9e3",
    secondary: "#a39d92",
    tertiary: "#948e81", // как в вебе: 4.8:1 на #221f1c
    muted: "#948e81",
    inverse: "#1c1a17",
    onGlass: "rgba(237,233,227,0.92)",
  },
  /*
    Золото — одно на обе роли. Надписью на тёмном холсте оно читается
    (6.7:1), заливкой несёт ТЁМНЫЕ чернила (brand.ink): белым по золоту
    контраст ~2:1, и так было бы в каждой кнопке.
  */
  accent: {
    primary: "#dcb748",
    secondary: "#b39a5a",
    success: "#3ddc97",
    danger: "#ff7a7a",
    warning: "#f0b545",
    info: "#7cb8e6",
  },
  brand: {
    primary: "#c9a227",
    primaryLight: "#dbb43f",
    secondary: "#b39a5a",
    primaryDim: "rgba(201,162,39,0.14)",
    glow: "rgba(201,162,39,0.22)",
    glowSoft: "rgba(201,162,39,0.10)",
    ink: "#1c1a17",
    // Главное действие экрана: то же золото.
    cta: "#c9a227",
    ctaInk: "#1c1a17",
  },
  // Плашка главной цифры: в тёмной — обычная карточка, цифра чернилами.
  hero: {
    bg: "#221f1c",
    ink: "#ede9e3",
    inkSoft: "#a39d92",
  },
  status: {
    success: "#3ddc97",
    successDim: "rgba(61,220,151,0.14)",
    successGlow: "rgba(61,220,151,0.18)",
    warning: "#f0b545",
    warningDim: "rgba(240,181,69,0.14)",
    danger: "#ff7a7a",
    dangerDim: "rgba(255,122,122,0.14)",
    info: "#7cb8e6",
    infoDim: "rgba(124,184,230,0.14)",
  },
  tab: {
    active: "#dcb748",
    inactive: "#8a8478",
    bg: "#221f1c",
    border: "#322e28",
  },
  // Градиенты — ровные: две точки одного цвета. Переливы коралла в фиолетовый
  // и было тем самым «дёшево»; имена остались, чтобы экраны не трогать.
  gradient: {
    primary: g("#c9a227", "#c9a227"),
    primarySoft: g("rgba(201,162,39,0.12)", "rgba(201,162,39,0.06)"),
    success: g("#3ddc97", "#3ddc97"),
    warm: g("#f0b545", "#f0b545"),
    danger: g("#ff7a7a", "#ff7a7a"),
    ocean: g("#7cb8e6", "#7cb8e6"),
    sunset: g("#f0b545", "#f0b545"),
    profileHeader: g("#2a2622", "#2a2622"),
  },
};

export const LightColors = {
  /*
    Холст и поверхности — вариант C. Холст прохладный серо-зелёный, карточка
    БЕЛАЯ и светлее холста: отделяется мягкой тенью, а не выдавленностью.
  */
  bg: {
    primary: "#f1f4f3",
    secondary: "#e9eeec",
    card: "#ffffff",
    elevated: "#ffffff",
    input: "#ffffff",
    overlay: "rgba(241,244,243,0.92)",
    glass: "rgba(255,255,255,0.94)",
    glassCard: "rgba(255,255,255,0.94)",
    overlayDark: "rgba(0,0,0,0.4)",
    glassButton: "rgba(255,255,255,0.8)",
  },
  border: {
    default: "#dfe6e4",
    subtle: "#e8eeec",
    strong: "#c6d1ce",
    focus: "#0e4f49",
    glass: "rgba(0,0,0,0.05)",
  },
  text: {
    primary: "#13201e",
    secondary: "#4b5a57",
    tertiary: "#5f6d6a", // 5.1:1 на #f1f4f3
    muted: "#5f6d6a",
    inverse: "#ffffff",
    onGlass: "rgba(19,32,30,0.92)",
  },
  // Бирюза знака: надписью 9.6:1 на холсте, заливкой — под белые чернила.
  accent: {
    primary: "#0e4f49",
    secondary: "#2f7d73",
    success: "#2bb673",
    danger: "#e5484d",
    warning: "#e0a01a",
    info: "#3b82c4",
  },
  brand: {
    primary: "#0e4f49",
    primaryLight: "#16665e",
    secondary: "#2f7d73",
    primaryDim: "rgba(14,79,73,0.09)",
    glow: "rgba(14,79,73,0.18)",
    glowSoft: "rgba(14,79,73,0.07)",
    ink: "#ffffff",
    // Главное действие экрана — жёлтое, как точка в знаке; чернила тёмные.
    cta: "#f5c518",
    ctaInk: "#13201e",
  },
  // Плашка главной цифры — бирюзовая, цифра белая.
  hero: {
    bg: "#0e4f49",
    ink: "#ffffff",
    inkSoft: "rgba(255,255,255,0.78)",
  },
  /*
    Состояния: заливка яркая, надпись — через readableInk (как было). Тоны
    спокойнее прежних кислотных, но всё ещё заливки, а не чернила.
  */
  status: {
    success: "#2bb673",
    successDim: "rgba(43,182,115,0.13)",
    successGlow: "rgba(43,182,115,0.18)",
    warning: "#e0a01a",
    warningDim: "rgba(224,160,26,0.15)",
    danger: "#e5484d",
    dangerDim: "rgba(229,72,77,0.11)",
    info: "#3b82c4",
    infoDim: "rgba(59,130,196,0.12)",
  },
  tab: {
    active: "#0e4f49",
    inactive: "#5f6d6a",
    bg: "#ffffff",
    border: "#e2e8e6",
  },
  gradient: {
    primary: g("#0e4f49", "#0e4f49"),
    success: g("#2bb673", "#2bb673"),
    warm: g("#e0a01a", "#e0a01a"),
    danger: g("#e5484d", "#e5484d"),
    ocean: g("#3b82c4", "#3b82c4"),
    sunset: g("#e0a01a", "#e0a01a"),
    primarySoft: g("rgba(14,79,73,0.08)", "rgba(14,79,73,0.04)"),
    profileHeader: g("#0e4f49", "#0e4f49"),
  },
};

export type ThemeColors = typeof DarkColors | typeof LightColors;

/**
 * Палитра с основным цветом арендатора.
 *
 * Цвет из брендинга раньше никуда не попадал: белая метка задавала его в
 * настройках, а приложение продолжало красить кнопки и вкладки своим голубым.
 * Здесь он заменяет ровно те места, где цвет означает «наш бренд» — заливки,
 * акцент, активную вкладку, рамку фокуса, — и не трогает статусы (успех,
 * ошибка, предупреждение): их цвет означает состояние, а не принадлежность,
 * и перекрасить его в фирменный значит отнять смысл.
 */
function withBrandColor(base: ThemeColors, brand: string, isDark: boolean): ThemeColors {
  /*
    Цвет арендатора — оттенок, не готовая заливка. Сырой hex шёл в обе темы
    как есть: тёмно-синий на тёмной карточке — грязь, жёлтый на светлой —
    вырви глаз. Палитра (lib/brand-palette, та же, что в вебе) оставляет тон
    и подгоняет светлоту и насыщенность под тему: контраст надписи и текста
    4.5:1 гарантирован, наведение — шаг светлоты того же тона.
  */
  const p = derivePalette(brand, isDark ? "dark" : "light");
  if (!p) return base;
  const primary = p.primary;
  return {
    ...base,
    accent: { ...base.accent, primary },
    border: { ...base.border, focus: primary },
    brand: {
      ...base.brand,
      primary,
      primaryLight: p.hover,
      // Прозрачность добавляется восемью знаками (#rrggbbaa) — так же, как
      // это уже делают экраны (colors.status.danger + "30").
      primaryDim: primary + "1f",
      glow: primary + "59",
      glowSoft: primary + "24",
      ink: p.onPrimary,
      // Главное действие — цвет арендатора: белая метка, а не наш жёлтый.
      cta: primary,
      ctaInk: p.onPrimary,
    },
    // Плашка цифры в светлой — цвет арендатора; в тёмной остаётся карточкой.
    hero: isDark ? base.hero : { bg: primary, ink: p.onPrimary, inkSoft: p.onPrimary },
    tab: { ...base.tab, active: primary },
    gradient: {
      ...base.gradient,
      primary: g(primary, p.hover),
      profileHeader: g(primary, p.hover),
    },
  };
}

/**
 * Цвет арендатора живёт здесь, а не в аргументе updateColors.
 *
 * Переключатель темы зовёт updateColors(isDark) из нескольких мест, и, будь
 * цвет аргументом, при первом же переключении темы он потерялся бы —
 * приложение вернулось бы к голубому до следующего запроса брендинга.
 */
let brandPrimary: string | null = null;

/** Задать (или снять — при выходе) основной цвет арендатора. */
export function setBrandPrimary(hex: string | null): void {
  brandPrimary = isHexColor(hex) ? hex : null;
}

/** Палитра темы с учётом цвета арендатора, если он задан. */
export function paletteFor(isDark: boolean): ThemeColors {
  const base = isDark ? DarkColors : LightColors;
  return brandPrimary ? withBrandColor(base, brandPrimary, isDark) : base;
}

// Colors will be updated by theme store - initially dark
// NOTE: Components should use useThemeColors() hook instead of importing Colors directly
// to avoid stale references after theme toggle
export let Colors: ThemeColors = DarkColors;

// Function to update Colors when theme changes
export function updateColors(isDark: boolean) {
  Colors = paletteFor(isDark);
  Gradients = buildGradients(Colors);
}

// ── Typography ────────────────────────────────────────────────────────────────
export const Typography = {
  fontDisplay: "Manrope_800ExtraBold",
  fontBody: "Manrope_400Regular",
  fontRegular: "Manrope_400Regular",
  fontMedium: "Manrope_500Medium",
  fontSemibold: "Manrope_600SemiBold",
  fontBold: "Manrope_700Bold",
  fontExtraBold: "Manrope_800ExtraBold",
  /*
    Ставится там, где цифры выравниваются по колонкам: артикулы, счётчики
    визитов, суммы, координаты. Взят только обычный: полужирного начертания
    нет ни в одном месте вызова, а лишний файл шрифта — лишний вес сборки.

    JetBrains Mono, а не DM Mono: на чипах состояния рядом с цифрами стоят
    русские слова («Посещён», «Следующий»), а у DM Mono кириллицы нет — строка
    набиралась бы двумя разными шрифтами сразу.
  */
  fontMono: "JetBrainsMono_400Regular",
  size: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    "2xl": 28,
    xxxl: 32,
    display: 36,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
  letterSpacing: {
    tight: -0.025,
    normal: 0,
    wide: 0.04,
    wider: 0.08,
  },
};

// ── Spacing ───────────────────────────────────────────────────────────────────
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  xxl: 32,
  "3xl": 40,
  xxxl: 48,
  "4xl": 64,
};

// ── Sizes ────────────────────────────────────────────────────────────────────
export const Sizes = {
  touchTarget: 44,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
// Soft UI uses noticeably rounder corners than the old Linear/Stripe look.
export const Radii = {
  xs: 6,
  sm: 10,
  md: 12,   // matches web .neo-btn border-radius
  lg: 16,
  xl: 20,
  xxl: 24,
  "2xl": 28,
  full: 999,
};

// ── Shadows ───────────────────────────────────────────────────────────────────
// Neumorphic shadow system — matches web index.css.
// RN can't do true dual-tone (light+dark sides), so we use the dominant
// dark-side shadow. The top highlight line in ui.tsx Card compensates.
// Светлая тема: тёплый #c9c3b8 — тон бумажного холста, только темнее (в вебе
// --shadow-* строится на rgba(160,152,140)). Тень в неоморфизме обязана быть
// цветом фона, иначе объём читается как пятно.
// Тёмная: чистый чёрный.
export const Shadows = {
  xs:          { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,  elevation: 1 },
  sm:          { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6,  elevation: 2 },
  md:          { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  lg:          { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 22, elevation: 6 },
  xl:          { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.10, shadowRadius: 30, elevation: 10 },
  card:        { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 3 },
  panel:       { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6,  elevation: 2 },
  panelRaised: { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 4 },
  // «Свечение» больше не светится: это была та самая неоновая дешевизна.
  glow:        { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 3 },
  glowSuccess: { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 3 },
  glowDanger:  { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 3 },
  inner:       { shadowColor: "#0e4f49", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,  elevation: 0 },
};

// Dark-mode shadow color override — used by ui.tsx where shadowColor needs to
// switch from the warm neumorphic tone (light) to plain black (dark), since
// a light-toned shadow reads muddy on a charcoal canvas.
export const DarkShadowColor = "#000000";

// ── Объём поверхностей ────────────────────────────────────────────────────────
//
// v8: без неоморфизма. Светлая тема — белая карточка на холсте, мягкая
// вертикальная тень в тон бирюзы (два слоя: широкий мягкий и узкий у края).
// Тёмная — тень на угольном холсте не видна, поверхность отделяет тонкая
// линия цвета рамки веба. Утопленное (поле ввода, жёлоб сегмента) — линия без
// тени в обеих: «утоплено» теперь значит «обведено», а не «вдавлено».
//
// Имена наборов прежние (raisedSm, raised, raisedLg, insetSm, inset): экраны
// их только раскладывают в стиль.

type Shadow = { offsetX: number; offsetY: number; blurRadius: number; color: string; inset?: boolean };
type Surface = { boxShadow: Shadow[]; borderWidth?: number; borderColor?: string };

const drop = (y: number, blur: number, a: number): Surface => ({
  boxShadow: [
    { offsetX: 0, offsetY: y, blurRadius: blur, color: `rgba(14,79,73,${a})` },
    { offsetX: 0, offsetY: 1, blurRadius: 2, color: "rgba(14,79,73,0.05)" },
  ],
});
const line = (color: string): Surface => ({ boxShadow: [], borderWidth: 1, borderColor: color });

const SOFT = {
  light: {
    /** Мелкое: значок, чип, кнопка-иконка. */
    raisedSm: drop(2, 6, 0.07),
    /** Карточка списка, строка маршрута, плашка. */
    raised:   drop(6, 18, 0.08),
    /** Крупное: плашка цифры, шапка профиля. */
    raisedLg: drop(10, 26, 0.09),
    /** Лунка под значком, номер точки. */
    insetSm:  line("#dfe6e4"),
    /** Поле ввода, жёлоб сегмент-контрола. */
    inset:    line("#dfe6e4"),
  },
  dark: {
    raisedSm: line("#322e28"),
    raised:   line("#322e28"),
    raisedLg: line("#322e28"),
    insetSm:  line("#2a2622"),
    inset:    line("#322e28"),
  },
};

/**
 * Набор теней под тему.
 *
 * Возвращает один и тот же объект на тему, а не собирает новый: стили попадают
 * в списки зависимостей и в сравнение пропсов, и новый объект на каждую
 * отрисовку сводил бы memo на нет.
 */
export const soft = (isDark: boolean) => (isDark ? SOFT.dark : SOFT.light);

/**
 * Грани приподнятой поверхности — для градиента.
 *
 * В референсе «выдавленный» элемент не плоский: сверху-слева он светлее
 * холста, снизу-справа темнее. Это второй слой объёма после теней, и без него
 * KPI-карточка выглядит наклейкой.
 */
export const raisedFaces = (isDark: boolean): readonly [string, string] =>
  isDark ? ["#221f1c", "#221f1c"] : ["#ffffff", "#ffffff"];

// ── Order Status Gradients ──────────────────────────────────────────────────
// Categorical palette for order-pipeline statuses (needs more distinct hues than
// the accent/status scale provides — e.g. purple for "shipped"). Theme-agnostic
// (same in light/dark) to match the web app's order status badges.
export const OrderStatusGradients: Record<string, readonly [string, string]> = {
  new: ["#3b82c4", "#3b82c4"],
  processing: ["#e0a01a", "#e0a01a"],
  shipped: ["#5b6d8a", "#5b6d8a"],
  pending: ["#c9713a", "#c9713a"],
  delivered: ["#2bb673", "#2bb673"],
  cancelled: ["#e5484d", "#e5484d"],
  returned: ["#b3261e", "#b3261e"],
};

// ── KPI Colors ────────────────────────────────────────────────────────────────
export const KpiColors = {
  indigo: "#3d5a80",
  blue: "#3b82c4",
  teal: "#0e4f49",
  green: "#2bb673",
  amber: "#e0a01a",
  orange: "#c9713a",
  red: "#e5484d",
  pink: "#a8506f",
  purple: "#5b6d8a",
  coral: "#c9713a",
};

export const KpiColorsDark = {
  indigo: "#8fa7d6",
  blue: "#7cb8e6",
  teal: "#5cc2b3",
  green: "#3ddc97",
  amber: "#f0b545",
  orange: "#e39a64",
  red: "#ff7a7a",
  pink: "#d98aa6",
  purple: "#a3b1c9",
  coral: "#e39a64",
};

// ── Animation Timing ──────────────────────────────────────────────────────────
export const Timing = {
  instant: 80,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSnappy: { damping: 20, stiffness: 300, mass: 0.8 },
  springBouncy: { damping: 12, stiffness: 180, mass: 0.8 },
  ease: [0.25, 0.46, 0.45, 0.94] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeInBack: [0.36, 0, 0.66, -0.56] as const,
  easeOutBack: [0.34, 1.56, 0.64, 1] as const,
};

// ── Gradients ─────────────────────────────────────────────────────────────────
// Static "always dark" surfaces (splash/header backgrounds) that don't flip
// with the theme toggle.
const StaticGradients = {
  dark: g("#221f1c", "#1c1a17"),
  card: g("#262320", "#221f1c"),
  // Глянцевый блик убран: в v8 поверхности матовые.
  sheen: g("rgba(255,255,255,0)", "rgba(255,255,255,0)"),
};

// Берёт готовую палитру, а не флаг темы: иначе цвет арендатора остался бы
// только в Colors, а Gradients — те же кнопки и шапки — красились бы старым.
const buildGradients = (palette: ThemeColors) => ({
  ...StaticGradients,
  ...palette.gradient,
  warning: palette.gradient.warm,
});

// Mutable, kept in sync with Colors by updateColors() so screens that import
// `Gradients` directly (without the theme hook) still pick up the cyan
// (dark) / blue (light) brand gradient after a theme toggle re-render.
export let Gradients: ReturnType<typeof buildGradients> = buildGradients(DarkColors);

// ── Safe bottom padding for Android navigation bar ────────────────────────────
// On Android, insets.bottom can be 0 with 3-button nav, but the nav bar still
// takes ~48px. This helper ensures buttons are always above the nav bar.
import { Platform } from "react-native";
/**
 * Отступ снизу для содержимого ВНУТРИ модального окна.
 *
 * ── Почему отдельно от safeBottomPadding ────────────────────────────────────
 *
 * Modal в React Native — отдельное окно системы, и контекст безопасной зоны
 * рассказывает про окно приложения, а не про него. На Android оттуда часто
 * приходит ноль, и запас в 24 точки, которого хватает обычному экрану,
 * оказывается меньше панели навигации: у телефонов с тремя кнопками она 48.
 *
 * Владелец дважды присылал снимок одного и того же: лист товара открыт, а
 * кнопка «Добавить в заказ» наполовину лежит на системной панели и не
 * нажимается. Поэтому здесь запас считается от высоты этой панели, а не от
 * полоски жестов.
 *
 * Цена ошибки несимметрична: лишний отступ — это пустая полоса внизу листа,
 * которую никто не заметит, а недостающий — кнопка, до которой нельзя
 * дотянуться. Берём с запасом.
 */
export function modalBottomPadding(insetsBottom: number, extra = 0): number {
  const ANDROID_NAV_BAR = 48;
  if (Platform.OS === "android") return Math.max(insetsBottom, ANDROID_NAV_BAR) + extra;
  return insetsBottom + extra;
}

/**
 * Высота плавающей панели вкладок.
 *
 * Панель стоит position:"absolute" ПОВЕРХ содержимого — экран о ней не знает
 * и обязан отбить низ сам, иначе последняя строка списка лежит под ней и не
 * нажимается.
 *
 * Число жило внутри Layout.tsx, и каждый следующий экран заводил своё: тот же
 * 80 отдельно лежал в orders.tsx и tracking.tsx. Три копии переживают первую
 * же правку панели ровно наполовину — два экрана поправят, третий забудут.
 *
 * Место здесь, а не в Layout: theme.ts — файл размеров, а не компонентов, и
 * экранам естественно брать отступ оттуда же, откуда они берут Spacing.
 */
/** Видимая высота панели вкладок (без системного отступа снизу). */
export const TAB_BAR_HEIGHT = 60;
/** Сколько содержимому отступать снизу: панель + воздух. К нему прибавляют insets.bottom. */
export const BOTTOM_TAB_HEIGHT = TAB_BAR_HEIGHT + 12;

export function safeBottomPadding(insetsBottom: number, extra = 16): number {
  if (Platform.OS === "android") {
    return Math.max(insetsBottom, 24) + extra;
  }
  return insetsBottom + extra;
}
