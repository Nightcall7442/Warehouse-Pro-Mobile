/**
 * Ничто на вкладках не должно уходить под системную полосу Android.
 *
 * Жалоба владельца: «некоторые кнопки в Redmi и других андроидах покажутся в
 * толе внизу, которым невозможно найти».
 *
 * Внизу экрана Android рисует свою панель — полосу жестов или три кнопки, от
 * 24 до 48 точек. Поверх экрана приложение вешает собственный таб-бар: он
 * абсолютный, места в разметке не занимает, высота ≈80. Всё, что нарисовано у
 * нижнего края без учёта обоих, оказывается под ними: элемент видно, а
 * нажатие уходит системе.
 *
 * Так был потерян сканер штрихкодов: paddingBottom стоял числом 32, и кнопка
 * «Заказать этот товар» — единственный способ добавить отсканированный товар
 * в заказ — не нажималась вовсе.
 *
 * ── Правило ─────────────────────────────────────────────────────────────────
 *
 * Отступ снизу у прокручиваемого содержимого на вкладке = insets.bottom плюс
 * не меньше высоты таб-бара. Высота объявлена в самом проекте:
 * BOTTOM_TAB_HEIGHT = 80 (app/(tabs)/orders.tsx, src/components/Layout.tsx).
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

/** Высота плавающего таб-бара, объявленная в проекте. */
const TAB_BAR_HEIGHT = 80;

const ROOT = process.cwd();

/** Экраны вкладок и то, что на них рисуется. */
function tabScreenFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, "app", "(tabs)"));
  // Виды планов рисуются прямо во вкладке «Планы» и живут в общих
  // компонентах — на них правило про таб-бар распространяется так же.
  //
  // А вот окна и шторки исключены: они лежат ПОВЕРХ вкладки, таб-бара под
  // ними нет, а системный отступ им даёт общая шторка BottomSheet — это
  // проверяется отдельно ниже. Требовать insets в каждом окне значило бы
  // требовать двойной отступ.
  walk(path.join(ROOT, "src", "components", "plans"));
  return out.filter(f => !/Modal.tsx$/.test(f));
}

interface BottomPadding {
  file: string;
  raw: string;
  addend: number | null;
  usesInsets: boolean;
}

/** Все отступы снизу у прокручиваемого содержимого. */
function scrollBottomPaddings(): BottomPadding[] {
  const found: BottomPadding[] = [];
  for (const file of tabScreenFiles()) {
    const src = fs.readFileSync(file, "utf8");
    // Берём только contentContainerStyle: это отступ прокручиваемого
    // содержимого, где правило однозначно. Внутренние карточки и поля со
    // своими отступами сюда не попадают.
    for (const m of src.matchAll(/contentContainerStyle=\{\{([^}]*)\}\}/g)) {
      const body = m[1];
      const pad = /paddingBottom:\s*([^,}\n]+)/.exec(body);
      if (!pad) continue;
      const raw = pad[1].trim();
      const usesInsets = /insets\.bottom|safeBottomPadding/.test(raw);
      const plus = /insets\.bottom\s*\+\s*(\d+)/.exec(raw);
      found.push({
        file: path.relative(ROOT, file).split(path.sep).join("/"),
        raw,
        addend: plus ? Number(plus[1]) : null,
        usesInsets,
      });
    }
  }
  return found;
}

describe("отступ снизу считается от системной панели", () => {
  const paddings = scrollBottomPaddings();

  it("проверять есть что — иначе разбор сломался и тест пуст", () => {
    // Без этого неверный разбор дал бы пустой список, и всё ниже прошло бы,
    // ничего не проверив.
    expect(paddings.length).toBeGreaterThan(5);
  });

  it.each(scrollBottomPaddings().map(p => [p.file, p.raw] as const))(
    "%s: paddingBottom %s учитывает системную панель",
    (file, raw) => {
      expect(/insets\.bottom|safeBottomPadding/.test(raw)).toBe(true);
    },
  );

  it("к системному отступу прибавляется высота таб-бара", () => {
    // Таб-бар абсолютный и места не занимает: без запаса на его высоту
    // последний элемент списка оказывается под ним. Так были недоступны
    // кнопки «Готово» и «Пропустить» у последнего магазина в плане визитов.
    const tooSmall = scrollBottomPaddings()
      .filter(p => p.addend !== null && p.addend < TAB_BAR_HEIGHT)
      .map(p => `${p.file}: insets.bottom + ${p.addend}`);

    if (tooSmall.length > 0) {
      throw new Error(
        `Отступ снизу меньше высоты таб-бара (${TAB_BAR_HEIGHT}):\n  ` +
          tooSmall.join("\n  ") +
          "\nПоследний элемент списка окажется под баром, и нажать его будет нельзя.",
      );
    }
    expect(tooSmall).toEqual([]);
  });
});

describe("общая нижняя шторка", () => {
  it("сама учитывает системную панель — окнам на ней это делать не нужно", () => {
    // Шторка прижата к нижнему краю экрана (position absolute, bottom 0).
    // Без отступа её нижняя часть — а это как раз кнопки «Создать» и
    // «Отмена» — уходит под полосу жестов Android.
    const src = fs.readFileSync(
      path.join(ROOT, "src", "components", "plans", "PlanHelpers.tsx"), "utf8",
    );
    const at = src.indexOf("maxHeight: \"86%\"");
    expect(at).toBeGreaterThan(0);
    const sheet = src.slice(at, at + 900);
    expect(sheet).toContain("paddingBottom: insets.bottom");
  });
});

describe("сканер штрихкодов", () => {
  it("нижняя панель не задана числом", () => {
    // Ровно тот случай, с которого началась жалоба: кнопка «Заказать этот
    // товар» уходила под системную полосу и таб-бар.
    const src = fs.readFileSync(path.join(ROOT, "app", "(tabs)", "barcode.tsx"), "utf8");
    const at = src.indexOf("{/* Нижняя панель");
    expect(at).toBeGreaterThan(0);

    // Отсчёт от КОНЦА пояснения, а не от его начала: внутри процитировано
    // старое значение «paddingBottom: 32», и регулярка находила цитату вместо
    // кода. Первая версия этой проверки на том и упала.
    const bar = src.slice(src.indexOf("*/}", at), at + 1400);
    const pad = /paddingBottom:\s*([^,}\n]+)/.exec(bar);
    expect(pad).not.toBeNull();
    expect(/insets\.bottom|safeBottomPadding/.test(pad![1])).toBe(true);
  });
});
