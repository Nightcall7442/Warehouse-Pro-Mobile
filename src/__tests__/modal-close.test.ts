/**
 * Из окна должно быть куда выйти, и выход не должен молча стирать работу.
 *
 * Жалоба владельца: «закрытие окон без х их тоже надо тщательно просмотреть».
 *
 * Разбор подтвердил три беды, и все три — в местах, где человек уже потратил
 * время:
 *
 *   • окно правки заказа: ни крестика, ни «Отмена», ни onRequestClose.
 *     Единственный выход — нажать мимо панели, и он стирал изменённые
 *     количества. Аппаратная кнопка «назад» не делала вообще ничего: без
 *     обработчика диалог Android поглощает событие;
 *   • там же: ввод первой буквы в «Заметки» возвращал количества к исходным,
 *     потому что эффект перезаполнял их на каждый рендер родителя;
 *   • анкета нового магазина: крестик стирал всё заполненное без вопроса,
 *     включая снятую у витрины точку GPS.
 *
 * ── Правило ─────────────────────────────────────────────────────────────────
 *
 * У каждого <Modal> обязан быть onRequestClose. Без него аппаратная «назад»
 * в этом окне мертва — это не мелочь, а единственная кнопка, которой человек
 * пользуется на Android не глядя.
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

const ROOT = process.cwd();

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.tsx$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "src"));
  return out;
}

/** Каждое открывающее <Modal ...> вместе с его свойствами. */
function modalTags(): Array<{ file: string; tag: string }> {
  const found: Array<{ file: string; tag: string }> = [];
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/<Modal\b[\s\S]*?>/g)) {
      found.push({
        file: path.relative(ROOT, file).split(path.sep).join("/"),
        tag: m[0],
      });
    }
  }
  return found;
}

/**
 * Известный долг: окна, у которых обработчика «назад» ещё нет.
 *
 * Список может только сокращаться. Пополнять его — значит заводить окно, из
 * которого на Android не выйти привычной кнопкой.
 */
// Пусто: все окна приложения обработчик получили. Проверка ниже следит,
// чтобы новое окно без него не появилось.
const NO_BACK_HANDLER_DEBT = new Set<string>([]);

describe("из окна есть выход аппаратной кнопкой «назад»", () => {
  const tags = modalTags();

  it("окна вообще нашлись — иначе разбор пуст и проверка бессмысленна", () => {
    expect(tags.length).toBeGreaterThan(3);
  });

  it("новых окон без onRequestClose не появилось", () => {
    const offenders = [...new Set(
      tags.filter(t => !/onRequestClose/.test(t.tag)).map(t => t.file),
    )].filter(f => !NO_BACK_HANDLER_DEBT.has(f));

    if (offenders.length > 0) {
      throw new Error(
        "Окно без onRequestClose: " + offenders.join(", ") +
        ".\nБез него аппаратная кнопка «назад» на Android в этом окне не делает " +
        "ничего — событие поглощается диалогом. Человек жмёт её несколько раз, " +
        "потом ищет, куда нажать пальцем.",
      );
    }
    expect(offenders).toEqual([]);
  });

  it("список долга не устарел", () => {
    // Если окно уже починили, а из списка не убрали, список перестаёт быть
    // картой и начинает разрешать новые поломки в том же файле.
    const stillBroken = new Set(
      tags.filter(t => !/onRequestClose/.test(t.tag)).map(t => t.file),
    );
    const stale = [...NO_BACK_HANDLER_DEBT].filter(f => !stillBroken.has(f));
    expect(stale).toEqual([]);
  });
});

describe("окно правки заказа", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src", "components", "order", "OrderEditModal.tsx"), "utf8",
  );

  it("количества заполняются один раз, а не на каждый рендер родителя", () => {
    // Родитель собирает массив items заново на каждом рендере, поэтому
    // эффект с зависимостью [visible, items] срабатывал на каждую букву в
    // «Заметках» и молча возвращал количества к исходным.
    expect(src).toContain("wasVisible");
    expect(src).toContain("visible && !wasVisible.current");
  });

  it("есть выход, и он спрашивает при несохранённых правках", () => {
    expect(src).toContain("onRequestClose={requestClose}");
    expect(src).toContain("Закрыть без сохранения?");
    // Крестик в шапке: раньше единственным выходом было нажатие мимо панели.
    expect(src).toContain('name="x"');
  });
});

describe("анкета нового магазина", () => {
  it("крестик спрашивает, если что-то заполнено", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "shop", "new.tsx"), "utf8");
    expect(src).toContain("onPress={requestClose}");
    expect(src).toContain("Выйти без сохранения?");
    // Снятая у витрины точка GPS считается заполненным: потерять её обиднее
    // прочего.
    expect(src).toContain("gpsLat");
  });
});
