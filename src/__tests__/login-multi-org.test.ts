/**
 * Вход в двух организациях — с телефона тоже.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Один адрес может быть заведён в нескольких организациях. Сервер в таком
 * случае не выбирает за человека — данные в этих организациях разные — а
 * отвечает 409 и называет их.
 *
 * Механизм на телефоне был собран ЦЕЛИКОМ и не подключён: api.ts бросает
 * TenantChoiceRequired, store принимает tenantId, сервер его ждёт — а ловить
 * ошибку было НЕКОМУ. Экран входа обрабатывал любое исключение как отказ и
 * показывал текст «Выберите организацию» красной плашкой. Выбрать было негде.
 *
 * То есть человек, заведённый в двух организациях, не мог войти с телефона
 * вообще. В вебе выбор при этом был.
 *
 * ── Почему проверка по исходнику ────────────────────────────────────────────
 *
 * Дыра была не в логике, а в том, что связь между готовыми частями никто не
 * провёл. Такое ловится только вопросом «а вызывается ли это откуда-нибудь» —
 * ровно тем же, чем ловились неподключённый вебхук бота и кроны, которые ни
 * разу не запускались.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SCREEN = join(__dirname, "..", "..", "app", "(auth)", "login.tsx");
const API = join(__dirname, "..", "api.ts");

/** Исходник без комментариев: пояснения сами называют то, что чинят. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("выбор организации на входе", () => {
  const screen = code(SCREEN);

  it("экран ловит TenantChoiceRequired отдельно от отказа", () => {
    expect(screen).toContain("TenantChoiceRequired");
    expect(screen).toMatch(/instanceof\s+TenantChoiceRequired/);
  });

  it("названия организаций выводятся списком", () => {
    // Иначе поймать ошибку мало: выбрать всё равно негде.
    expect(screen).toMatch(/orgChoice\.organizations\.map/);
  });

  it("выбранная организация уходит обратно на сервер", () => {
    // Второй запрос с tenantId — то, ради чего сервер и назвал список.
    expect(screen).toMatch(/handleLogin\(org\.tenantId\)/);
  });

  it("tenantId доходит до входа, а не теряется по дороге", () => {
    expect(screen).toMatch(/handleLogin\s*=\s*async\s*\(tenantId/);
    // четвёртым доводом — код второго фактора (пусто, пока сервер его не попросил)
    expect(screen).toMatch(/login\(email\.trim\(\)\.toLowerCase\(\),\s*password,\s*tenantId,\s*code/);
  });

  it("обработчики не подсовывают событие вместо tenantId", () => {
    /*
      onPress и onSubmitEditing передают первым доводом событие. Отдай мы им
      handleLogin напрямую — событие уехало бы в tenantId, и вход сломался бы у
      ВСЕХ, а не только у тех, кто в двух организациях.
    */
    expect(screen).not.toMatch(/onPress=\{handleLogin\}/);
    expect(screen).not.toMatch(/onSubmitEditing=\{handleLogin\}/);
    expect(screen).toMatch(/onPress=\{\(\)\s*=>\s*handleLogin\(\)\}/);
  });

  it("правка в полях снимает прежний выбор", () => {
    // Список относился к прошлой паре логин-пароль: после правки он врёт.
    expect(screen).toMatch(/setEmail\(v\);\s*setOrgChoice\(null\)/);
    expect(screen).toMatch(/setPassword\(v\);\s*setOrgChoice\(null\)/);
  });

  it("сторона api по-прежнему умеет отличать этот случай", () => {
    // Без этого экран ловил бы то, чего никто не бросает.
    const api = code(API);
    expect(api).toContain("class TenantChoiceRequired");
    expect(api).toMatch(/status === 409/);
    expect(api).toContain("TENANT_REQUIRED");
  });
});

describe("кнопка входа во время запроса", () => {
  it("крутится системный кружок, а не неподвижный значок", () => {
    /*
      Стоял <Feather name="loader" />. Значок неподвижен: во время входа он
      просто стоял на кнопке, и это читалось как «зависло», а не «идёт».
    */
    const screen = code(SCREEN);
    expect(screen).toContain("ActivityIndicator");
    expect(screen).not.toMatch(/name="loader"/);
  });
});
