/**
 * Цвет текста, который будет читаться на выбранном фоне.
 *
 * Нужно там, где фон выбирает не дизайнер, а арендатор: основной цвет бренда
 * приходит из настроек и уезжает на кнопки, вкладки и шапку профиля. Надпись
 * поверх была прописана белым — на тёмно-синем это нормально, а на жёлтом или
 * салатовом контраст падает до 1.3:1, и текст на кнопке пропадает совсем.
 *
 * Порог 0.179 — точка, где относительная яркость даёт одинаковый контраст с
 * чёрным и с белым по формуле WCAG. Тот же расчёт, что и в вебе
 * (src/lib/contrast.ts): одинаковый цвет бренда должен давать одинаковые
 * чернила в браузере и на телефоне.
 */

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Относительная яркость по WCAG 2.1. Принимает #rgb и #rrggbb. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Тёмные чернила на светлом фоне, светлые — на тёмном. */
export function readableInk(background: string): string {
  return luminance(background) > 0.179 ? "#1c1a17" : "#ffffff";
}

/** Цвет из #rrggbb — только если он действительно такой формы. */
export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Второй край градиента для кнопки цвета арендатора.
 *
 * Тёмный цвет осветляем, светлый — затемняем. Всегда светлить нельзя: у
 * бледно-жёлтого второй край упёрся бы в белый, и кнопка растворилась бы в
 * карточке.
 */
export function shade(hex: string, amount = 0.18): string {
  const toward = luminance(hex) > 0.179 ? 0 : 255;
  const mixed = rgb(hex).map(v => Math.round(v + (toward - v) * amount));
  return "#" + mixed.map(v => v.toString(16).padStart(2, "0")).join("");
}
