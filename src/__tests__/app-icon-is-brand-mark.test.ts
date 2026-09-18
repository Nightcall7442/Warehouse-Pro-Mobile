/**
 * Значок приложения — фирменный знак, а не заглушка.
 *
 * Слияние двух ветвей (b25ae9d) молча вернуло старые PNG: в App Store
 * появился фиолетовый кубик вместо знака «W» на бирюзе. Исходники в
 * assets/brand при этом остались, так что глазами не видно ничего, пока
 * сборка не дойдёт до магазина. Тест смотрит в сами PNG: заливка значка и
 * адаптивного значка — бирюза бренда (#0d9488…#0f5e57), а не что-то ещё.
 */
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const asset = (f: string) => PNG.sync.read(fs.readFileSync(path.join(__dirname, "../../assets", f)));
const px = (p: PNG, x: number, y: number) => {
  const i = (p.width * y + x) * 4;
  return { r: p.data[i], g: p.data[i + 1], b: p.data[i + 2], a: p.data[i + 3] };
};
/** Бирюза бренда: зелёный заметно выше красного, синий рядом с зелёным. */
const isBrandTeal = ({ r, g, b, a }: ReturnType<typeof px>) => a === 255 && g > r + 60 && Math.abs(g - b) < 40;

describe("значок приложения", () => {
  it("icon.png — 1024², непрозрачный, заливка бирюзой бренда по всем углам", () => {
    const p = asset("icon.png");
    expect([p.width, p.height]).toEqual([1024, 1024]);
    for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023], [512, 40]]) expect(isBrandTeal(px(p, x, y))).toBe(true);
  });
  it("adaptive-icon.png — та же бирюза; notification-icon и splash на месте", () => {
    const p = asset("adaptive-icon.png");
    expect([p.width, p.height]).toEqual([1024, 1024]);
    expect(isBrandTeal(px(p, 0, 0))).toBe(true);
    expect([asset("notification-icon.png").width, asset("splash.png").width]).toEqual([256, 1024]);
    // Заставка — знак на прозрачном: цвет фона задаёт app.json, а не картинка.
    expect(px(asset("splash.png"), 0, 0).a).toBe(0);
  });
});
