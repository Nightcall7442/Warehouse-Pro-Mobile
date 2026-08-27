import fs from "node:fs";
import path from "node:path";

/**
 * `return` без `await` внутри try — обрыв, который catch не поймает.
 *
 * ── Что это стоило ──────────────────────────────────────────────────────────
 *
 * В app/(tabs)/deliveries.tsx все три отметки курьера были написаны так:
 *
 *     try {
 *       return markDelivered(orderId, cashAmount);
 *     } catch (e) {
 *       // ... положить действие в офлайн-очередь
 *     }
 *
 * Возврат промиса из try завершает функцию до того, как промис отклонится:
 * отказ уходит наверх мимо catch. То есть перехват, написанный ровно ради
 * обрыва связи в дверях магазина — и снабжённый подробным комментарием, почему
 * он необходим, — не срабатывал ни разу.
 *
 * Наблюдалось так: курьер отдал товар, взял наличные, нажал «Доставлено» и
 * увидел красный тост с текстом ошибки. В очереди пусто, отметки нет, деньги
 * получены и нигде не записаны. Рядом, в app/order/deliver.tsx, тот же приём
 * написан правильно — с `await`, — поэтому разница и не бросалась в глаза.
 *
 * Проверка статическая: воспроизвести это в тесте можно только подняв экран
 * целиком с подменённой сетью, а сама ошибка — привычка, а не логика.
 */

const ROOTS = ["app", "src"];
const EXT = new Set([".ts", ".tsx"]);

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXT.has(path.extname(entry.name))) yield full;
  }
}

/**
 * Имена, привезённые из слоя api — статическим импортом или динамическим.
 *
 * Проверять всякий `return f(...)` внутри try бессмысленно: синхронный вызов
 * catch поймает как положено, и таких мест в коде хватает — форматирование
 * даты, чтение из sessionStorage. Опасен именно возврат сетевого вызова.
 */
function apiNames(source: string): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /import\s*\{([^}]+)\}\s*from\s*["'][^"']*api["']/g,
    /(?:const|let)\s*\{([^}]+)\}\s*=\s*await\s+import\(["'][^"']*api["']\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      for (const part of m[1].split(",")) {
        const name = part.split(" as ").pop()!.trim();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

/** Строка вида `return someApiCall(...)` — без await. */
function isBareApiReturn(code: string, api: Set<string>): boolean {
  const m = /^\s*return\s+(?!await\b)([A-Za-z_$][\w$]*)\s*\(/.exec(code);
  return m !== null && api.has(m[1]);
}

function bareReturnsInsideTry(source: string): number[] {
  const api = apiNames(source);
  if (api.size === 0) return [];

  const lines = source.split("\n");
  const found: number[] = [];
  let depth = 0;             // глубина скобок внутри текущего try
  let inTry = false;
  // Вложенные функции: возврат из колбэка к try отношения не имеет. Так
  // написан, например, Promise.allSettled(actions.map(a => { return f(a) }))
  // в src/store/offline.ts — промисы там возвращаются намеренно.
  const fnLevels: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, "");

    if (!inTry && /\btry\s*\{/.test(code)) {
      inTry = true;
      depth = 0;
      fnLevels.length = 0;
      continue;
    }
    if (!inTry) continue;

    const opens = (code.match(/\{/g) ?? []).length;
    const closes = (code.match(/\}/g) ?? []).length;

    if (fnLevels.length === 0 && isBareApiReturn(code, api)) found.push(i + 1);

    if (opens > 0 && /(=>|\bfunction\b)/.test(code)) fnLevels.push(depth + 1);

    depth += opens - closes;
    while (fnLevels.length > 0 && depth < fnLevels[fnLevels.length - 1]) fnLevels.pop();
    if (depth < 0) inTry = false;
  }
  return found;
}

describe("перехват ошибок в асинхронных функциях", () => {
  it("внутри try сетевой вызов не возвращается без await", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      const dir = path.join(__dirname, "..", "..", root);
      if (!fs.existsSync(dir)) continue;
      for (const file of walk(dir)) {
        const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
        for (const line of bareReturnsInsideTry(source)) {
          const rel = path.relative(path.join(__dirname, "..", ".."), file).split("\\").join("/");
          offenders.push(`${rel}:${line}  ${source.split("\n")[line - 1].trim().slice(0, 70)}`);
        }
      }
    }

    expect(offenders.length === 0 ? [] : offenders).toEqual([]);
  });

  it("страж ловит то, ради чего написан", () => {
    // Проверка, которая не может упасть, ничего не бережёт.
    const head = `import { markDelivered } from "../api";\n`;
    const body = (ret: string) =>
      head + `async function f() {\n  try {\n    ${ret}\n  } catch (e) {\n    queue();\n  }\n}`;

    expect(bareReturnsInsideTry(body("return markDelivered(id);"))).toEqual([4]);
    expect(bareReturnsInsideTry(body("return await markDelivered(id);"))).toEqual([]);
    expect(bareReturnsInsideTry(body("return { offline: true };"))).toEqual([]);
    // Синхронный вызов не из api — не наше дело.
    expect(bareReturnsInsideTry(body("return format(d, \"d MMMM\");"))).toEqual([]);
  });
});
