// ──────────────────────────────────────────────────────────────────────────────
// Warehouse Pro — язык оформления v7
//
// Мягкий неоморфизм: элемент цвета холста, объём даёт тень — светлый блик
// сверху-слева и серая тень снизу-справа. Коралл — единственный акцент:
// активная вкладка, следующая точка маршрута, кнопки действия, кольцо
// прогресса. Шрифт Manrope.
//
// ── Что поменялось в v7 ───────────────────────────────────────────────────────
//
// Только ЗНАЧЕНИЯ токенов. Ни одно имя не убрано и не добавлено: экраны,
// разметка и поведение остались как были — им незачем знать, что палитра
// другая. Холст из тёплого бежевого стал прохладным серо-голубым, акцент из
// сине-серого — коралловым.
//
// ── Про два коралла ───────────────────────────────────────────────────────────
//
// Их именно два, и это не небрежность. Яркий #f26d6d хорош заливкой и никуда
// не годится надписью: на холсте #efedea у него контраст низкий. Для надписей
// и мелких знаков стоит затемнённый #d64a45 — 3.6:1, то есть годен для
// крупного текста и элементов управления. Заливка живёт в brand и gradient,
// надпись — в accent.
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
  bg: {
    primary: "#1c1a17",
    secondary: "#221f1c",
    card: "#221f1c",
    elevated: "#262320",
    input: "#221f1c",
    overlay: "rgba(28,26,23,0.85)",
    glass: "rgba(34,31,28,0.75)",
    glassCard: "rgba(38,35,32,0.7)",
    overlayDark: "rgba(0,0,0,0.5)",
    glassButton: "rgba(255,255,255,0.08)",
  },
  border: {
    default: "#322e28",
    subtle: "#2a2622",
    strong: "#423d35",
    focus: "#f26d6d",
    glass: "rgba(255,255,255,0.08)",
  },
  text: {
    primary: "#ede9e3",
    secondary: "#a39d92",
    tertiary: "#8a8478", // WCAG AA: 4.5:1 on #1c1a17
    muted: "#8a8478",
    inverse: "#1c1a17",
    onGlass: "rgba(237,233,227,0.92)",
  },
  /*
    Акцент тёмной темы — тот же коралл, только светлее.

    Марка не должна меняться от переключателя темы: голубой в тёмной и
    коралловый в светлой — это два разных приложения на одном телефоне.

    Взят глубокий #e0554f, а не светлый #ff8b87: этот токен служит и заливкой
    кнопки, поверх которой идёт БЕЛАЯ надпись. На светлом коралле она даёт
    2.3:1 — то есть пропадает; на этом 3.8:1. Надписью на тёмном холсте он
    тоже читается — 4.3:1.
  */
  accent: {
    primary: "#e0554f",
    secondary: "#a78bfa",
    success: "#00e68a",
    danger: "#ff6b6b",
    warning: "#ffb020",
    info: "#00b4ff",
  },
  brand: {
    primary: "#f26d6d",
    primaryLight: "#ff8b87",
    secondary: "#a78bfa",
    primaryDim: "rgba(242,109,109,0.16)",
    glow: "rgba(242,109,109,0.35)",
    glowSoft: "rgba(242,109,109,0.14)",
    // Чернила поверх заливки brand.primary. Для нашего цвета это белый —
    // как и было прописано по экранам. Цвет арендатора считает своё
    // значение по яркости (withBrandColor), потому что белым по светлому
    // фону надпись пропадает.
    ink: "#ffffff",
  },
  status: {
    success: "#00e68a",
    successDim: "rgba(0,230,138,0.18)",
    successGlow: "rgba(0,230,138,0.25)",
    warning: "#ffb020",
    warningDim: "rgba(255,176,32,0.18)",
    danger: "#ff4d6a",
    dangerDim: "rgba(255,77,106,0.18)",
    info: "#00b4ff",
    infoDim: "rgba(0,180,255,0.18)",
  },
  // Вкладка активна тем же кораллом, что и всё остальное: голубая вкладка
  // рядом с коралловой кнопкой читалась бы как два разных приложения.
  tab: {
    active: "#ff8b87",
    inactive: "#756f64",
    bg: "rgba(34,31,28,0.92)",
    border: "rgba(255,255,255,0.06)",
  },
  gradient: {
    primary: g("#ff8b87", "#e0554f"),
    primarySoft: g("rgba(242,109,109,0.16)", "rgba(167,139,250,0.06)"),
    success: g("#00e68a", "#3cd0b0"),
    warm: g("#ffb020", "#f09858"),
    danger: g("#ff4d6a", "#e878a8"),
    ocean: g("#5cb6ea", "#4aa8e0"),
    sunset: g("#f09858", "#e878a8"),
    profileHeader: g("#ff8b87", "#e0554f"),
  },
};

export const LightColors = {
  /*
    Холст и грани.

    В неоморфизме карточка НЕ светлее фона — она того же цвета, а объём даёт
    тень. Поэтому card равен primary. Приподнятые поверхности (kpi, активная
    вкладка) собираются градиентом elevated → sunken, это те самые «блик
    сверху-слева, тень снизу-справа» из референса.
  */
  /*
    Тёплая бумага — та же, что в веб-приложении (src/index.css: --color-surface
    #efedea, raised #f2f0ec, light #f6f4f0). Раньше здесь стоял холодный
    серо-голубой холст из референса, и телефон рядом с вебом читался чужим
    продуктом (владелец, 17.09.2026: «не сочетается с вебом»).
  */
  bg: {
    primary: "#efedea",
    secondary: "#f2f0ec",
    card: "#efedea",
    elevated: "#f6f4f0",
    input: "#efedea",
    overlay: "rgba(239,237,234,0.9)",
    glass: "rgba(242,240,236,0.8)",
    glassCard: "rgba(242,240,236,0.85)",
    overlayDark: "rgba(0,0,0,0.4)",
    glassButton: "rgba(255,255,255,0.55)",
  },
  border: {
    default: "#d8d5cd",
    subtle: "#e0ddd7",
    strong: "#c4c0b8",
    focus: "#f26d6d",
    glass: "rgba(0,0,0,0.05)",
  },
  /*
    Чернила.

    primary — прямо из референса. А вот secondary и tertiary там заданы
    светлее, чем читается: #6b7280 даёт на этом холсте 4.0:1, #9aa1ad — 2.2:1,
    то есть подписи под числами на телефоне в руках, на солнце, разобрать было
    бы нельзя. Тон сохранён — тот же прохладный серо-голубой, — но затемнён до
    5.0:1 и 4.6:1.
  */
  text: {
    primary: "#2b2a28",
    secondary: "#5e5b54",
    tertiary: "#6b6760", // 4.81:1 на #efedea — как в вебе
    muted: "#6b6760",
    inverse: "#ffffff",
    onGlass: "rgba(43,42,40,0.92)",
  },
  /*
    Коралл здесь — для надписей и мелких знаков: 3.6:1, то есть крупный текст
    и элементы управления. Заливка живёт в brand ниже.

    А вот состояния остаются ЗАЛИВКАМИ и яркими, как были. Затемнить их
    заманчиво, но на них ложатся надписи через readableInk, и стоит белому
    начать читаться на зелёной кнопке — помощник перестаёт быть нужен и его
    однажды тихо выкинут. Проверка в theme-contrast сторожит ровно это.
  */
  accent: {
    primary: "#d64a45",
    secondary: "#8e7cf0",
    success: "#37c98b",
    danger: "#f26d6d",
    warning: "#f0a53a",
    info: "#4aa8e0",
  },
  // Коралл для заливки: кнопки, градиенты, кольца.
  brand: {
    primary: "#f26d6d",
    primaryLight: "#ff8b87",
    secondary: "#8e7cf0",
    primaryDim: "rgba(242,109,109,0.14)",
    glow: "rgba(242,109,109,0.30)",
    glowSoft: "rgba(242,109,109,0.10)",
    ink: "#ffffff",
  },
  /*
    Состояния: заливка яркая, надпись затемнённая.

    Тот же приём, что у коралла, и по той же причине: #37c98b хорош кружком и
    не читается словом.
  */
  status: {
    success: "#37c98b",
    successDim: "rgba(55,201,139,0.16)",
    successGlow: "rgba(55,201,139,0.24)",
    warning: "#f0a53a",
    warningDim: "rgba(240,165,58,0.16)",
    danger: "#f26d6d",
    dangerDim: "rgba(242,109,109,0.14)",
    info: "#4aa8e0",
    infoDim: "rgba(74,168,224,0.15)",
  },
  tab: {
    active: "#d64a45",
    inactive: "#626976",
    bg: "rgba(231,234,240,0.95)",
    border: "rgba(0,0,0,0.05)",
  },
  gradient: {
    primary: g("#ff8b87", "#e0554f"),
    success: g("#43d896", "#37c98b"),
    warm: g("#f5b95c", "#f0a53a"),
    danger: g("#ff8b87", "#e0554f"),
    ocean: g("#5cb6ea", "#4aa8e0"),
    sunset: g("#f0a53a", "#f26d6d"),
    primarySoft: g("rgba(242,109,109,0.14)", "rgba(142,124,240,0.06)"),
    profileHeader: g("#ff8b87", "#e0554f"),
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
    },
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
  xs: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 1,
  },
  sm: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 12,
  },
  card: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 7, height: 7 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  panel: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 2,
  },
  panelRaised: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 5,
  },
  glow: {
    shadowColor: "#5b6d8a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  glowSuccess: {
    shadowColor: "#34c473",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  glowDanger: {
    shadowColor: "#d45050",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  inner: {
    shadowColor: "#c9c3b8",
    shadowOffset: { width: -3, height: -3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: -1,
  },
};

// Dark-mode shadow color override — used by ui.tsx where shadowColor needs to
// switch from the warm neumorphic tone (light) to plain black (dark), since
// a light-toned shadow reads muddy on a charcoal canvas.
export const DarkShadowColor = "#000000";

// ── Мягкий объём ──────────────────────────────────────────────────────────────
//
// Пара теней на элемент: светлая сверху-слева, тёмная снизу-справа. Элемент при
// этом цвета холста — объём даёт только тень. Это и есть язык референса.
//
// «Вдавленное» (inset) — не украшение, а состояние: нажатая карточка, жёлоб
// сегмент-контрола, лунка под значком. Палец видит, что нажатие принято, без
// смены цвета.
//
// Значения — из референса: 4/9 у мелкого, 6/13 у карточки, 7/16 у крупного,
// 2/5 и 3/7 у вдавленного.

/** Светлая тема: тень цвета холста, но темнее; блик — чистый белый. */
const LIGHT_DARK_FACE = "#c9c3b8";
const LIGHT_LIGHT_FACE = "#ffffff";

/*
  Тёмная тема: белым бликом здесь пользоваться нельзя — на угольном холсте он
  читается как засветка, а не как грань. Берётся едва заметный, и тень при этом
  глубже: на тёмном фоне тень работает сильнее блика, а не наравне.
*/
const DARK_DARK_FACE = "rgba(0,0,0,0.55)";
const DARK_LIGHT_FACE = "rgba(255,255,255,0.05)";

type Shadow = { offsetX: number; offsetY: number; blurRadius: number; color: string; inset?: boolean };

function pair(d: number, blur: number, dark: string, light: string): { boxShadow: Shadow[] } {
  return {
    boxShadow: [
      { offsetX: d,  offsetY: d,  blurRadius: blur, color: dark },
      { offsetX: -d, offsetY: -d, blurRadius: blur, color: light },
    ],
  };
}

function sunken(d: number, blur: number, dark: string, light: string): { boxShadow: Shadow[] } {
  return {
    boxShadow: [
      { offsetX: d,  offsetY: d,  blurRadius: blur, color: dark,  inset: true },
      { offsetX: -d, offsetY: -d, blurRadius: blur, color: light, inset: true },
    ],
  };
}

function softSet(dark: string, light: string) {
  return {
    /** Мелкое: значок, чип, кнопка-иконка. */
    raisedSm: pair(4, 9, dark, light),
    /** Карточка списка, строка маршрута, плашка. */
    raised:   pair(6, 13, dark, light),
    /** Крупное: KPI, шапка профиля, панель вкладок. */
    raisedLg: pair(7, 16, dark, light),
    /** Лунка под значком, номер точки. */
    insetSm:  sunken(2, 5, dark, light),
    /** Жёлоб сегмент-контрола, нажатая карточка. */
    inset:    sunken(3, 7, dark, light),
  };
}

const SOFT = {
  light: softSet(LIGHT_DARK_FACE, LIGHT_LIGHT_FACE),
  dark:  softSet(DARK_DARK_FACE, DARK_LIGHT_FACE),
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
  isDark ? ["#262320", "#1a1815"] : ["#f4f6f9", "#dde0e7"];

// ── Order Status Gradients ──────────────────────────────────────────────────
// Categorical palette for order-pipeline statuses (needs more distinct hues than
// the accent/status scale provides — e.g. purple for "shipped"). Theme-agnostic
// (same in light/dark) to match the web app's order status badges.
export const OrderStatusGradients: Record<string, readonly [string, string]> = {
  new: ["#4a9de8", "#4b6cf6"],
  processing: ["#e8a830", "#f09050"],
  shipped: ["#9b59b6", "#8e44ad"],
  pending: ["#f09050", "#e8a830"],
  delivered: ["#34c473", "#2ec4b0"],
  cancelled: ["#e85050", "#f06895"],
  returned: ["#e85050", "#c0392b"],
};

// ── KPI Colors ────────────────────────────────────────────────────────────────
export const KpiColors = {
  indigo: "#5b6d8a",
  blue: "#5a8fad",
  teal: "#3a9a8a",
  green: "#34c473",
  amber: "#d4973a",
  orange: "#c07040",
  red: "#d45050",
  pink: "#c06080",
  purple: "#7a6db5",
  coral: "#f06895",
};

export const KpiColorsDark = {
  indigo: "#7b94f8",
  blue: "#58a8f0",
  teal: "#3cd0b0",
  green: "#5ad88e",
  amber: "#f0c040",
  orange: "#f09858",
  red: "#f06060",
  pink: "#e878a8",
  purple: "#a088f0",
  coral: "#e878a8",
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
  sheen: g("rgba(255,255,255,0.06)", "rgba(255,255,255,0)"),
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
