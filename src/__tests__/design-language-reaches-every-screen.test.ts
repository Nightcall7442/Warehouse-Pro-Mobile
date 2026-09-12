/**
 * Язык оформления доходит до каждого экрана.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Владелец спросил: «новый дизайн применился везде?» Оказалось — нет, и
 * заметить это было нечем: экраны читали цвета из темы, поэтому проверка
 * «нет ли старой палитры» их пропускала. А язык держится не на цвете.
 *
 * Он держится на ОБЪЁМЕ: поверхность отделяется от холста парой теней —
 * светлый блик сверху-слева, серая тень снизу-справа, — а поле ввода утоплено
 * в холст жёлобом. Линии в этом языке нет вовсе.
 *
 * Экран входа не имел ни одной тени и ни одного размерного токена: карточка с
 * рамкой в один пиксель, скругления числами, поля — обведённые коробки. Человек
 * открывал приложение, видел одно оформление, входил и попадал в другое.
 * «Выдача заказа» рисовала восемь рамок и ни одной карточки. Ещё в двадцати
 * местах выбор показывался толщиной обводки вместо объёма.
 *
 * ── Правило ─────────────────────────────────────────────────────────────────
 *
 * Поверхность не обводится линией. Рамка допустима там, где она сама несёт
 * смысл (пунктир «положите фото»), и такие места перечислены поимённо.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (/^(node_modules|__tests__|\.git|\.expo|android|ios|dist)$/.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const FILES = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src", "components"))].map(f => ({
  rel:  relative(ROOT, f).split("\\").join("/"),
  text: strip(readFileSync(f, "utf8")),
}));

const byName = (rel: string) => FILES.find(f => f.rel === rel)!;

describe("объём вместо линии", () => {
  it("поверхность не обводится рамкой", () => {
    /*
      Ровно тот приём, который остался от прежнего языка: карточка цвета холста
      плюс линия по краю. На светлом сером холсте это читается как чертёж, а не
      как предмет, — и именно так выглядели «выдача заказа», строки плана и
      половина окон поверх экрана.
    */
    const offenders = FILES
      .filter(f => /borderWidth:\s*[\d.]+\s*,\s*borderColor:\s*colors\.border\./.test(f.text))
      .map(f => f.rel);

    expect(offenders).toEqual([]);
  });

  it("экран входа набран тем же языком, что и всё остальное", () => {
    /*
      Он единственный не подключал общий набор кирпичей и рисовал всё сам.
      Проверяется не «красиво ли», а три вещи, которых там не было: объём,
      размерные токены и отсутствие рамок.
    */
    const login = byName("app/(auth)/login.tsx");
    expect(login.text).toContain("soft(isDark)");
    expect(login.text).toMatch(/Radii\./);
    expect(login.text).toMatch(/Spacing\./);
    expect(login.text).not.toMatch(/borderWidth:\s*[1-9]/);
    // Скругления числами — признак того, что экран живёт своей жизнью.
    expect(login.text.match(/borderRadius:\s*\d+/g) ?? []).toEqual([]);
  });

  it("поля ввода утоплены, а не выпуклы", () => {
    /*
      Выпуклое поле читается как кнопка: по нему нажимают, а не пишут в него.
      Здесь ловится ровно эта путаница — приподнятый набор теней внутри
      TextInput.
    */
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.text.matchAll(/<TextInput[\s\S]{0,900}?\/>/g)) {
        if (/soft\((?:isDark|[^)]*)\)\.raised/.test(m[0])) offenders.push(f.rel);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("в экранах не осталось вписанных цветов", () => {
    /*
      Вписанный цвет не меняется вместе с темой: в тёмной он остаётся тем же и
      либо слепит, либо пропадает. Исключения — цвет, которого в палитре нет по
      существу, и белый на фирменном градиенте.
    */
    const ALLOWED = new Set([
      // Четвёртый оттенок для «частичного возврата»: три состояния заказа уже
      // заняли успех, предупреждение и опасность, а этот обязан отличаться от
      // всех трёх.
      "app/order/deliver.tsx",
    ]);
    const offenders = FILES
      .filter(f => f.rel.startsWith("app/") && !ALLOWED.has(f.rel))
      .flatMap(f => (f.text.match(/#[0-9a-fA-F]{6}\b/g) ?? [])
        .filter(c => c.toLowerCase() !== "#ffffff")
        .map(c => `${f.rel}: ${c}`));

    expect(offenders).toEqual([]);
  });

  it("тёмная тема не гасит акцент", () => {
    /*
      На главном экране пять раз стояло `isDark ? "#a39d92" : colors.accent.primary`:
      в светлой подпись коралловая, в тёмной — серая. Тема же говорит прямо, что
      акцент один на обе: «голубой в тёмной и коралловый в светлой — это два
      разных приложения на одном телефоне».
    */
    const offenders = FILES
      .filter(f => /isDark\s*\?\s*"#[0-9a-fA-F]{6}"\s*:\s*colors\./.test(f.text))
      .map(f => f.rel);

    expect(offenders).toEqual([]);
  });
});
