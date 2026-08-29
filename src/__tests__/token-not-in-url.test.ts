import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Сессионный токен не должен попадать в адрес.
 *
 * Раньше SecureImage приклеивал `?token=<весь JWT>` к каждой внутренней ссылке
 * на фотографию. Приём рабочий, сервер его принимает, но адрес — не секретное
 * место: адреса целиком оседают в журналах обращений на каждом узле по дороге
 * (сам сервер, обратный прокси, сеть доставки, кэш), хранятся дольше сессии и
 * регулярно уезжают в системы разбора журналов.
 *
 * А токен здесь не узкий ключ на одну картинку — это полный сессионный токен:
 * с ним делают что угодно от имени человека. На экране каталога агент
 * открывает сотни картинок за смену, и каждая оставляла его токен ещё в одном
 * журнале.
 *
 * Заголовок туда не попадает. React Native передаёт заголовки источника
 * картинки и на iOS, и на Android.
 *
 * Проверка следит за правилом целиком: любой новый код, склеивающий токен с
 * адресом, уронит её.
 */

const root = join(__dirname, "..", "..");

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

describe("Токен в адресе", () => {
  test("файлы для проверки найдены", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("никакой код не приклеивает токен к адресу", () => {
    const bad: string[] = [];

    for (const file of files) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // Комментарии не считаем: в них об этой ошибке как раз и рассказано.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        // Склейка вида ?token=… или &token=… с подстановкой значения.
        if (/[?&]token=\$\{/.test(line) || /[?&]token=["'`]?\s*\+/.test(line)) {
          bad.push(`${file.slice(root.length + 1)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    if (bad.length > 0) {
      throw new Error(
        "Токен склеен с адресом — он осядет в журналах обращений по всей дороге:\n  " +
          bad.join("\n  "),
      );
    }
  });

  test("картинка получает токен заголовком", () => {
    const src = readFileSync(join(root, "src", "components", "SecureImage.tsx"), "utf8");

    // Заголовок, а не адрес.
    expect(src).toMatch(/headers:\s*\{\s*Authorization:/);
    expect(src).not.toMatch(/token=\$\{/);

    // Пока токен читается из защищённого хранилища, рисовать нельзя: запрос
    // без заголовка вернёт 401, и неудача осядет в кэше картинок.
    expect(src).toContain("if (token === undefined) return null;");
  });

  test("мёртвая authUrl не вернулась", () => {
    const api = readFileSync(join(root, "src", "api.ts"), "utf8");
    // Она была экспортирована, но не звалась ниоткуда — то есть лежала
    // готовым способом снова завести токен в адрес.
    expect(api).not.toContain("export async function authUrl");
  });
});
