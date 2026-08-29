import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Результат постановки в очередь нельзя выбрасывать.
 *
 * addDeliveryAction и addOrder возвращают признак: легла ли запись на диск.
 * На рабочих телефонах место кончается, и запись остаётся только в памяти —
 * до первой выгрузки приложения системой, а происходит она сама, пока телефон
 * лежит в кармане.
 *
 * Курьерский поток этот признак не читал: `await addDeliveryAction(...)` без
 * присваивания, дальше жёсткое `return { offline: true }` и спокойное «Доставка
 * сохранена офлайн». Курьер отдавал товар, брал деньги, читал сообщение и
 * уходил — а отметки не оставалось нигде. В оформлении заказа тот же случай
 * был разобран правильно, в курьерском — нет.
 *
 * Проверка следит за правилом целиком, а не за двумя починенными файлами:
 * любой новый вызов, который выбросит результат, уронит её.
 */

const root = join(__dirname, "..", "..");
const QUEUE_FNS = ["addDeliveryAction", "addOrder"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "src"))];

describe("Признак записи в очередь", () => {
  test("файлы для проверки найдены", () => {
    // Если обход сломается, остальные проверки станут зелёными впустую.
    expect(files.length).toBeGreaterThan(20);
  });

  for (const fn of QUEUE_FNS) {
    test(`результат ${fn} нигде не выбрасывается`, () => {
      const bad: string[] = [];

      for (const file of files) {
        // Само хранилище объявляет и реализует эти функции — там присваивания
        // быть не может по смыслу.
        if (file.endsWith(join("store", "offline.ts"))) continue;

        const text = readFileSync(file, "utf8");
        text.split("\n").forEach((line, i) => {
          if (!line.includes(`${fn}(`)) return;
          // Объявление типа, импорт, разбор из хранилища — не вызовы.
          if (/^\s*(import|export|\/\/|\*)/.test(line)) return;
          if (line.includes(`${fn}:`)) return;
          if (line.includes(`const { ${fn}`) || line.includes(`, ${fn} }`)) return;

          // Вызов засчитывается разобранным, если его результат куда-то идёт:
          // присваивается, возвращается, проверяется условием.
          const used =
            /(?:const|let|var)\s+\w+\s*=\s*await\s+\w*\.?\w*\b/.test(line) ||
            /=\s*await\s/.test(line) ||
            /return\s+await\s/.test(line) ||
            /if\s*\(\s*!?\s*await\s/.test(line);

          if (!used) bad.push(`${file.slice(root.length + 1)}:${i + 1}  ${line.trim()}`);
        });
      }

      if (bad.length > 0) {
        throw new Error(
          `Результат ${fn} выброшен — запись могла не лечь на диск, ` +
            `а человеку скажут «сохранено»:\n  ` + bad.join("\n  "),
        );
      }
    });
  }

  test("курьерский экран не рапортует об успехе, не проверив признак", () => {
    const deliver = readFileSync(join(root, "app", "order", "deliver.tsx"), "utf8");

    // Признак должен доехать из queueOffline до обработчика.
    expect(deliver).toContain("const queued = await addDeliveryAction(");
    expect(deliver).toMatch(/return \{ offline: true as const, queued,/);

    // И там его должны прочитать раньше, чем показать спокойное сообщение.
    const ok = deliver.indexOf("if (!data.queued)");
    const calm = deliver.indexOf("Доставка сохранена офлайн");
    expect(ok).toBeGreaterThan(-1);
    expect(ok).toBeLessThan(calm);
  });

  test("вкладка доставок проверяет признак во всех трёх действиях", () => {
    const tab = readFileSync(join(root, "app", "(tabs)", "deliveries.tsx"), "utf8");
    const checks = tab.split("if (!result.queued)").length - 1;
    // Взял в доставку, доставлено, не доставлено.
    expect(checks).toBe(3);
  });
});
