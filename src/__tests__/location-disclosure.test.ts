/**
 * Раскрытие перед запросом фоновой геолокации.
 *
 * ── Почему это страж, а не просто экран ─────────────────────────────────────
 *
 * Правило Google Play про геолокацию в фоне требует заметного разъяснения ДО
 * системного запроса разрешения и согласия отдельным действием. Приложение без
 * него не просто не пропускают — уже опубликованное СНИМАЮТ, и обжалование
 * занимает недели, в течение которых агенты не могут установить приложение.
 *
 * То есть цена поломки здесь — не баг, а остановка выкладки. Такое нельзя
 * оставлять на внимательность: раскрытие легко «временно» обойти, отлаживая
 * что-нибудь другое, и забыть вернуть.
 *
 * ── И это не только про магазин ─────────────────────────────────────────────
 *
 * Здесь следят за живым человеком на работе. Системное окно говорит
 * «разрешить доступ к местоположению» и НЕ говорит, что след увидит начальник,
 * — а соглашается человек именно на это.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function must(ok: boolean, why: string) {
  if (!ok) throw new Error(why);
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

/** Комментарий — не код: разборы ниже сами называют и согласие, и слежку. */
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const GPS = strip(read("app/(tabs)/gps.tsx"));
const SHEET = read("src/components/LocationDisclosure.tsx");
const SHEET_CODE = strip(SHEET);
const APP_JSON = read("app.json");

describe("раскрытие стоит перед системным запросом", () => {
  it("включение трекинга открывает раскрытие, а не разрешение", () => {
    /*
      Главная проверка. Переключатель НЕ должен включать трекинг напрямую:
      сперва раскрытие, и только по согласию — всё остальное.
    */
    const at = GPS.indexOf("onValueChange={v => {");
    must(at > -1, "обработчик переключателя не найден");
    const handler = GPS.slice(at, GPS.indexOf("}}", at));
    must(handler.includes("if (v) setAskConsent(true)"), "включение идёт мимо раскрытия");
  });

  it("трекинг включается только из согласия", () => {
    /*
      Мест ровно два, и оба законны:

        1. согласие в раскрытии — первое включение;
        2. восстановление после перезапуска, и ТОЛЬКО если разрешение ещё
           живо. Согласие человек уже давал; спрашивать заново на каждом
           запуске — навязчивость, а не бережность.

      Второе стережётся отдельной проверкой ниже: без условия про разрешение
      приложение молча показало бы системное окно без разъяснения.
    */
    const enables = [...GPS.matchAll(/setAutoTrack\(true\)/g)];
    must(
      enables.length === 2,
      `включений трекинга ${enables.length}, ожидалось два — согласие и восстановление`,
    );

    const fromConsent = GPS.indexOf("onAccept={() =>");
    must(fromConsent > -1, "трекинг включается не из согласия");
    must(
      GPS.slice(fromConsent, GPS.indexOf("}", fromConsent + 20)).includes("setAutoTrack(true)"),
      "согласие больше не включает трекинг",
    );
  });

  it("отказ ничего не включает", () => {
    const at = GPS.indexOf("onDecline");
    must(at > -1, "отказ не обработан");
    const line = GPS.slice(at, GPS.indexOf("\n", at + 40));
    must(!line.includes("setAutoTrack(true)"), "отказ что-то включает");
  });

  it("восстановление после перезапуска не обходит раскрытие", () => {
    /*
      Признак «трекинг был включён» лежит в памяти телефона. Если человек тем
      временем отозвал доступ в настройках, безоговорочное восстановление
      показало бы системное окно без разъяснения — ровно то, что запрещено.
    */
    const at = GPS.indexOf("AsyncStorage.getItem(AUTO_TRACK_KEY)");
    must(at > -1, "восстановление признака не найдено");
    const block = GPS.slice(at, GPS.indexOf("}, []);", at));
    must(
      block.includes("getBackgroundPermissionsAsync"),
      "трекинг восстанавливается, не проверив, живо ли разрешение",
    );
    must(block.includes('status === "granted"'), "проверка разрешения ничего не решает");
  });

  it("выключение не спрашивает ничего", () => {
    // Отказаться от слежки можно без объяснений и мгновенно.
    const at = GPS.indexOf("onValueChange={v => {");
    const handler = GPS.slice(at, GPS.indexOf("}}", at));
    expect(handler).toContain("else setAutoTrack(false)");
  });
});

describe("раскрытие говорит то, что требуется сказать", () => {
  /*
    Проверяется наличие ФАКТОВ, а не красота формулировок. Каждый пункт —
    из требований Google к «prominent disclosure»: что собираем, что в фоне,
    кто видит, как отказаться.

    Ищем в ВИДИМОМ тексте, без комментариев. Первая попытка читала файл
    целиком — и молчала, когда фразу из раскрытия убирали: те же слова
    находились в разборе наверху файла, который человеку не показывают.
    Поймано нарочной поломкой, тремя сразу.
  */
  const FACTS: Array<[string, RegExp]> = [
    ["сбор местоположения", /местополож/i],
    ["работа в фоне", /свёрнут|экран выключен|в фоне/i],
    ["кто видит след", /супервайзер|руководител/i],
    ["как выключить", /выключить/i],
    ["как часто", /двух минут|две минуты|2 минут/i],
  ];

  for (const [what, re] of FACTS) {
    it(`сказано: ${what}`, () => {
      must(re.test(SHEET_CODE), `в раскрытии не сказано про «${what}»`);
    });
  }

  it("есть отдельное действие согласия и равный ему отказ", () => {
    /*
      Согласие, вытянутое оформлением, — не согласие. Отказ обязан быть таким
      же доступным: обе кнопки не мельче пальца.
      */
    expect(SHEET_CODE).toContain("onAccept");
    expect(SHEET_CODE).toContain("onDecline");
    const targets = [...SHEET_CODE.matchAll(/minHeight: Sizes\.touchTarget/g)];
    must(targets.length >= 2, `цель касания задана ${targets.length} раз — обе кнопки должны быть крупными`);
  });

  it("названа политика конфиденциальности", () => {
    // Ссылку требуют оба магазина, и человек должен знать, где прочитать
    // подробнее. Тоже в видимом тексте: в комментарии она не поможет никому.
    must(/warehouse-pro\.uz|конфиденциальн/i.test(SHEET_CODE), "политика не названа в раскрытии");
  });
});

describe("объявленные разрешения объяснены", () => {
  it("у каждого разрешения iOS есть текст причины", () => {
    // Пустая или общая формулировка — типовой отказ Apple по 5.1.1.
    for (const key of [
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
      "NSCameraUsageDescription",
      "NSPhotoLibraryUsageDescription",
    ]) {
      const m = APP_JSON.match(new RegExp(`"${key}":\\s*"([^"]*)"`));
      must(m !== null, `нет объяснения для ${key}`);
      must(m![1].length > 30, `объяснение для ${key} слишком короткое: «${m![1]}»`);
    }
  });

  it("фоновая геолокация объявлена осознанно", () => {
    // Она есть — и раскрытие выше существует именно из-за неё. Пропадёт
    // разрешение — раскрытие станет лишним, и об этом надо узнать здесь.
    expect(APP_JSON).toContain("ACCESS_BACKGROUND_LOCATION");
    expect(APP_JSON).toContain("isAndroidBackgroundLocationEnabled");
  });
});

describe("сборка для магазина настроена", () => {
  const EAS = read("eas.json");

  it("Google Play получает AAB, а не APK", () => {
    // Play не принимает APK для новых приложений с 2021 года.
    const at = EAS.indexOf('"production"');
    must(at > -1, "профиля production нет");
    must(EAS.slice(at).includes('"buildType": "app-bundle"'), "production собирает не app-bundle");
  });

  it("номер версии растёт сам", () => {
    // Повторная загрузка с тем же versionCode отклоняется консолью.
    expect(EAS).toContain('"autoIncrement": true');
    expect(EAS).toContain('"appVersionSource": "remote"');
  });

  it("первая отправка идёт черновиком во внутренний трек", () => {
    /*
      Не «сразу всем». Черновик и internal — чтобы ошибку в карточке или
      сборке заметить до того, как её увидят люди.
    */
    expect(EAS).toContain('"track": "internal"');
    expect(EAS).toContain('"releaseStatus": "draft"');
  });
});
