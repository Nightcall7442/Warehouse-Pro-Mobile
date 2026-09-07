// Warehouse Pro — карта агентов у супервайзера
import fs from "node:fs";
import path from "node:path";
import { isTabVisible, canSeeAgentMap, ALWAYS_HIDDEN } from "../lib/tabs";

/**
 * Супервайзеры не видели карту.
 *
 * Экран «Слежение» в приложении был, но лежал в списке всегда скрытых вкладок:
 * единственной дверью к нему оставалась карточка «ТРЕКИНГ» на главной. А сама
 * карта в APK не открывалась вовсе — ключ Яндекс.Карт не передавался сборке ни
 * из app.json, ни из eas.json, и на месте карты был пустой прямоугольник без
 * объяснений.
 */

describe("вкладка с картой", () => {
  it("супервайзер её видит", () => {
    expect(isTabVisible("tracking", "supervisor")).toBe(true);
    expect(isTabVisible("tracking", "ceo")).toBe(true);
  });

  it("оператору не показывается: сервер ему местоположения не отдаёт", () => {
    // agent.getLocations стоит на supervisorQuery (ceo + супервайзер). Вкладка,
    // открывающая экран с отказом, хуже отсутствующей.
    expect(canSeeAgentMap("operator")).toBe(false);
    expect(isTabVisible("tracking", "operator")).toBe(false);
  });

  it("агенту, мерчендайзеру и курьеру — нет", () => {
    for (const role of ["agent", "merchandiser", "courier", undefined]) {
      expect(isTabVisible("tracking", role)).toBe(false);
    }
  });

  it("экран больше не в списке всегда скрытых", () => {
    expect(ALWAYS_HIDDEN).not.toContain("tracking");
  });
});

describe("остальные вкладки не поехали", () => {
  it("у супервайзера — главная, магазины, планы, нормы", () => {
    for (const name of ["index", "shops", "plans", "targets"]) {
      expect(isTabVisible(name, "supervisor")).toBe(true);
    }
    for (const name of ["catalog", "orders", "profile"]) {
      expect(isTabVisible(name, "supervisor")).toBe(false);
    }
  });

  it("у агента — своя работа, без надзорных экранов", () => {
    for (const name of ["index", "shops", "catalog", "orders", "profile"]) {
      expect(isTabVisible(name, "agent")).toBe(true);
    }
    for (const name of ["plans", "targets", "tracking"]) {
      expect(isTabVisible(name, "agent")).toBe(false);
    }
  });

  it("у курьера магазинов нет: он едет по заказам", () => {
    expect(isTabVisible("shops", "courier")).toBe(false);
  });
});

describe("ключ карты", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../components/YandexMapView.tsx"), "utf8");

  it("есть запасной — иначе сборка без переменной уезжает без карты", () => {
    /*
      Именно так и вышло: eas.json не передаёт EXPO_PUBLIC_YANDEX_MAPS_API_KEY
      ни одному профилю, в app.json ключа нет, и APK показывал пустоту. В вебе
      тот же ключ зашит в код, поэтому там карта работала.
    */
    expect(src).toContain("const FALLBACK_KEY =");
    expect(src).toContain("!configuredKey || looksLikePlaceholder ? FALLBACK_KEY : configuredKey");
  });

  it("свой ключ из окружения главнее запасного", () => {
    // Запасной — страховка от незаполненной настройки, а не замена своей.
    const line = src.split("\n").find(l => l.includes("const YANDEX_API_KEY")) ?? "";
    expect(line).toContain("configuredKey");
  });

  it("незагрузившаяся карта объясняется словами", () => {
    // Пустой прямоугольник не отличить от сломанного экрана: отклонённый ключ
    // и пропавшая сеть выглядят одинаково, если ничего не сказать.
    expect(src).toContain('report(\'script\')');
    expect(src).toContain('data.type === "mapError"');
    expect(src).toContain("Карта не открылась");
  });
});

describe("мерчендайзер доходит до своей работы", () => {
  /*
    У мерчендайзера было ровно две вкладки — «Главная» и «Магазины». Отчёт о
    визите, то есть вся его работа, открывается с экрана плана, а тот лежал в
    ALWAYS_HIDDEN. Единственной дверью оставалась стрелка размером с иконку в
    углу карточки на главной.
  */
  it("план визитов — его вкладка", () => {
    expect(isTabVisible("plan", "merchandiser")).toBe(true);
  });

  it("у остальных ролей план вкладкой не становится", () => {
    for (const role of ["agent", "supervisor", "ceo", "operator", "courier"]) {
      expect([role, isTabVisible("plan", role)]).toEqual([role, false]);
    }
  });

  it("вкладок у мерчендайзера больше двух", () => {
    const all = ["index", "shops", "catalog", "orders", "plan", "plans", "targets", "deliveries", "profile", "tracking"];
    const visible = all.filter(n => isTabVisible(n, "merchandiser"));
    expect(visible).toContain("plan");
    expect(visible.length).toBeGreaterThan(2);
  });
});

describe("у курьера есть чем работать", () => {
  /*
    У курьера оставалась ровно ОДНА вкладка — «Главная». Панель из одной
    кнопки ничего не переключает, а экран доставок, ради которого он и
    открывает приложение, лежал среди всегда скрытых.
  */
  it("доставки — его вкладка", () => {
    expect(isTabVisible("deliveries", "courier")).toBe(true);
  });

  it("у остальных ролей доставки вкладкой не становятся", () => {
    for (const role of ["agent", "supervisor", "ceo", "operator", "merchandiser"]) {
      expect([role, isTabVisible("deliveries", role)]).toEqual([role, false]);
    }
  });

  it("профиль есть у тех, у кого панель иначе пуста", () => {
    // Курьер и мерчендайзер искали выход из учётной записи плиткой на главной.
    for (const role of ["courier", "merchandiser"]) {
      expect([role, isTabVisible("profile", role)]).toEqual([role, true]);
    }
    // У надзорных панель и так полная — решение прежнее.
    for (const role of ["supervisor", "ceo", "operator"]) {
      expect([role, isTabVisible("profile", role)]).toEqual([role, false]);
    }
  });

  it("панель курьера больше не из одной кнопки", () => {
    const all = ["index", "shops", "catalog", "orders", "plan", "plans", "targets", "deliveries", "profile", "tracking"];
    const visible = all.filter(n => isTabVisible(n, "courier"));
    expect(visible).toContain("deliveries");
    expect(visible.length).toBeGreaterThan(2);
  });
});
