/**
 * Что греет телефон.
 *
 * ── Зачем этот файл ─────────────────────────────────────────────────────────
 *
 * Расход батареи — единственная поломка, которую пользователь замечает
 * последней и объясняет неправильно. Агент не скажет «ваш экран планов ходит
 * на сервер раз в минуту из свёрнутого приложения» — он скажет «телефон стал
 * быстро садиться», и виноватым окажется что угодно.
 *
 * Поэтому правила записаны здесь, а не оставлены на внимательность:
 *
 *   1. постоянный опрос сервера идёт только на ОТКРЫТОМ экране;
 *   2. точку снимает кто-то один: системная задача ИЛИ таймер, не оба;
 *   3. автоматическая съёмка не будит спутниковый приёмник;
 *   4. бесконечная анимация останавливается, когда перестаёт быть нужна.
 *
 * ── Что здесь НЕ проверяется ────────────────────────────────────────────────
 *
 * Сам расход в миллиамперах. Померить его тестом нельзя, и делать вид, что
 * можно, не будем. Проверяются приёмы, каждый из которых уже стоил батареи.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function must(ok: boolean, why: string) {
  if (!ok) throw new Error(why);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/** Комментарий — не код: разборы ниже сами называют и watchPosition, и 0.02. */
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...sources(rel));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = [...sources("app"), ...sources("src")].map(p => ({ path: p, code: strip(read(p)) }));

describe("постоянный опрос — только на открытом экране", () => {
  it("у каждого refetchInterval стоит условие видимости", () => {
    /*
      Вкладки expo-router НЕ размонтируются: однажды открытый экран продолжает
      опрашивать сервер, пока приложение запущено. У супервайзера, свернувшего
      приложение утром, это несколько сотен запросов за день — и столько же
      пробуждений радио ради данных, на которые никто не смотрит.

      Ровно так и было на экране планов супервайзера: соседний экран агента
      условие имел, а этот — нет.
    */
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.code.matchAll(/refetchInterval:\s*([^,\n]+)/g)) {
        const value = m[1].trim();
        // Условие может быть любым, лишь бы оно было: важно, что опрос
        // выключается, а не то, как называется признак.
        if (!/\?/.test(value) && value !== "false") {
          offenders.push(`${f.path}: refetchInterval: ${value}`);
        }
      }
    }
    must(
      offenders.length === 0,
      "опрос идёт и с закрытого экрана:\n  " + offenders.join("\n  "),
    );
  });

  it("проверка не пуста — опросы в приложении есть", () => {
    // Иначе «ни одного нарушения» означало бы, что разбор ничего не нашёл.
    const total = FILES.reduce((n, f) => n + [...f.code.matchAll(/refetchInterval:/g)].length, 0);
    must(total >= 3, `опросов найдено ${total} — разбор сломался`);
  });
});

describe("точку снимает кто-то один", () => {
  const GPS = strip(read("app/(tabs)/gps.tsx"));

  it("свой таймер включается, только если система следить отказалась", () => {
    /*
      Работали оба сразу: системная задача отдаёт точку при сдвиге на 50
      метров, а таймер раз в пять минут будил приёмник НЕЗАВИСИМО от того,
      двигался человек или нет. Агент в магазине, на обеде или в пробке —
      телефон всё равно снимает ту же самую точку.
    */
    const at = GPS.indexOf("startBackgroundTracking().then");
    must(at > -1, "запуск системной задачи не найден");
    const block = GPS.slice(at, GPS.indexOf("});", at));
    expect(block).toContain("if (result.success) return;");
    expect(block).toContain("setInterval(locate, FALLBACK_TRACK_MS)");
  });

  it("таймер не заводится рядом с системной задачей", () => {
    // Вне ветки «система отказалась» setInterval быть не должно.
    const timers = [...GPS.matchAll(/setInterval\(/g)];
    must(timers.length === 1, `таймеров ${timers.length}, ожидался один — запасной`);
  });

  it("запасной опрос назван и не чаще пяти минут", () => {
    const m = GPS.match(/FALLBACK_TRACK_MS = (\d+) \* 60 \* 1000/);
    must(m !== null, "величина запасного опроса не названа");
    must(Number(m![1]) >= 5, `запасной опрос раз в ${m![1]} мин — чаще, чем нужно`);
  });
});

describe("автоматическая съёмка не будит спутники", () => {
  it("точность взята сберегающая, а не наивысшая", () => {
    /*
      Accuracy.Balanced берётся по вышкам и Wi-Fi — это десятки метров в
      городе и почти даром. Highest/BestForNavigation держат приёмник
      включённым, и на пятиминутном опросе это заметно за день.
    */
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.code.matchAll(/Accuracy\.(\w+)/g)) {
        if (["Highest", "BestForNavigation"].includes(m[1])) {
          offenders.push(`${f.path}: Accuracy.${m[1]}`);
        }
      }
    }
    must(offenders.length === 0, "спутниковый приёмник будится зря:\n  " + offenders.join("\n  "));
  });

  it("точность не задаётся числом", () => {
    // `accuracy: 1` — это Lowest, километры; `accuracy: 6` — навигационная и
    // самая дорогая. Оба однажды уже стояли по недоразумению: число не
    // говорит читателю ничего.
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.code.matchAll(/accuracy:\s*(\d+)/g)) {
        offenders.push(`${f.path}: accuracy: ${m[1]}`);
      }
    }
    must(offenders.length === 0, "точность задана числом вместо Accuracy.*:\n  " + offenders.join("\n  "));
  });

  it("фоновая задача настроена по расстоянию и с задержкой", () => {
    /*
      distanceInterval — то, из-за чего стоящий телефон молчит вовсе:
      система не будит приложение, пока агент не сдвинулся. Убери его — и
      точки польются по таймеру ОС.
    */
    const BG = strip(read("src/backgroundLocation.ts"));
    expect(BG).toContain("distanceInterval:");
    expect(BG).toContain("deferredUpdatesInterval:");
    expect(BG).toContain("Accuracy.Balanced");
  });
});

describe("бесконечные анимации останавливаются", () => {
  it("у каждой есть отмена или условие", () => {
    /*
      withRepeat(..., -1) крутится, пока живёт компонент. На экране, который
      не размонтируется, это постоянная работа отрисовщика — а выглядит как
      «просто крутилка».
    */
    const offenders: string[] = [];
    for (const f of FILES) {
      if (!/withRepeat\(/.test(f.code)) continue;
      const stops = /cancelAnimation\(/.test(f.code) || /if \(/.test(f.code);
      if (!stops) offenders.push(f.path);
    }
    must(offenders.length === 0, "вечная анимация без остановки:\n  " + offenders.join("\n  "));
  });

  it("крутилка GPS останавливается, когда съёмка кончилась", () => {
    const GPS = strip(read("app/(tabs)/gps.tsx"));
    expect(GPS).toContain("cancelAnimation(spin)");
  });
});

describe("постоянных соединений и удержания экрана нет", () => {
  it("ни сокетов, ни keep-awake", () => {
    /*
      Открытый сокет держит радио, а keepAwake не даёт телефону уснуть — и то
      и другое в приложении торгового агента ничем не оправдано: свежесть
      данных обеспечивает опрос на открытом экране.
    */
    const offenders: string[] = [];
    for (const f of FILES) {
      if (/new WebSocket\(|new EventSource\(|activateKeepAwake|useKeepAwake/.test(f.code)) {
        offenders.push(f.path);
      }
    }
    must(offenders.length === 0, "появилось постоянное соединение или удержание экрана:\n  " + offenders.join("\n  "));
  });
});

describe("список разобранных файлов не пуст", () => {
  it("иначе все проверки выше молчат", () => {
    must(FILES.length > 30, `разобрано файлов: ${FILES.length}`);
    must(
      FILES.some(f => relative(".", f.path).includes("gps")),
      "экран GPS не попал в разбор",
    );
  });
});
