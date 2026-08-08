/* eslint-disable @typescript-eslint/no-var-requires */

// Хранилище и сетевой слой — нативные модули; в тестовой среде их нет.
// Подменяются так же, как в соседних тестах этого проекта.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiRemove: jest.fn(async () => {}),
  },
}));

jest.mock("../api", () => ({
  createOrder: jest.fn(),
  markOutForDelivery: jest.fn(),
  markDelivered: jest.fn(),
  markFailed: jest.fn(),
  completeDelivery: jest.fn(),
}));

const { isRetryableError } = require("../store/offline");
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Что попадает в офлайн-очередь и под чьим именем оттуда уходит.
 *
 * Две отдельные беды, обе из полевых условий.
 *
 * Первая: точки входа определяли «это сбой сети?» поиском подстроки
 * "status 5" в тексте ошибки. Axios пишет «Request failed with status code
 * 502» — между "status" и "5" стоит слово "code", и совпадения не было
 * НИКОГДА. При ответе шлюза заказ не попадал в очередь и терялся, а у курьера
 * пропадала отметка о доставке вместе с принятыми наличными.
 *
 * Вторая: телефон в поле часто общий. Агент сдавал смену, выходил из аккаунта,
 * сменщик входил — и очередь предыдущего уходила под ЕГО токеном. Сервер берёт
 * автора из сессии, поэтому заказы, выручка и комиссия записывались не тому
 * человеку.
 */

const MOBILE_ROOT = process.cwd();
const read = (p: string) => readFileSync(join(MOBILE_ROOT, p), "utf8");

describe("разбор ошибки: что считать сбоем доставки запроса", () => {
  it("502 от шлюза — повторяем", () => {
    // Тот самый текст, который писал axios и который старая проверка не ловила.
    expect(isRetryableError(new Error("Request failed with status code 502"))).toBe(true);
  });

  it("503 и 504 — тоже", () => {
    expect(isRetryableError({ response: { status: 503 } })).toBe(true);
    expect(isRetryableError({ response: { status: 504 } })).toBe(true);
  });

  it("обрыв связи и таймаут — повторяем", () => {
    expect(isRetryableError(new Error("Network request failed"))).toBe(true);
    expect(isRetryableError(new Error("timeout of 15000ms exceeded"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
  });

  it("отказ сервера по существу — НЕ повторяем", () => {
    // Иначе заказ, отвергнутый по делу (нет товара, закрыт магазин), лёг бы в
    // очередь и всплывал бы снова и снова, а курьер считал бы его принятым.
    expect(isRetryableError({ serverRejected: true, trpcMessage: "Недостаточно товара" })).toBe(false);
    expect(isRetryableError({ response: { status: 400 } })).toBe(false);
    expect(isRetryableError({ response: { status: 403 } })).toBe(false);
  });

  it("429 и 408 — повторяем, хотя это 4xx", () => {
    expect(isRetryableError({ response: { status: 429 } })).toBe(true);
    expect(isRetryableError({ response: { status: 408 } })).toBe(true);
  });
});

describe("точки входа пользуются общим разбором", () => {
  for (const file of ["app/order/new.tsx", "app/order/deliver.tsx", "app/(tabs)/deliveries.tsx"]) {
    it(`${file} не хранит свою копию проверки`, () => {
      const src = read(file);
      // Ищется именно ВЫЗОВ проверки, а не упоминание строки: в этих файлах
      // она осталась в комментариях как объяснение прежней ошибки.
      expect(src).not.toMatch(/includes\("status 5"\)/);
      expect(src).toContain("isRetryableError");
    });
  }

  it("действия курьера имеют запасной путь, а не только предполётную проверку", () => {
    const src = read("app/(tabs)/deliveries.tsx");
    // Предполётная проверка сети не спасает: Android считает подключением и
    // EDGE, и Wi-Fi с окном входа. Нужен перехват вокруг самого вызова.
    const queueCalls = src.match(/addDeliveryAction\(/g) ?? [];
    // Три действия × (предполётная ветка + перехват при сбое) = шесть.
    expect(queueCalls.length).toBeGreaterThanOrEqual(6);
  });
});

describe("записи очереди помечены автором", () => {
  const src = read("src/store/offline.ts");

  it("владелец проставляется при постановке в очередь", () => {
    expect(src).toMatch(/ownerId\?: number/);
    expect(src).toMatch(/ownerId: order\.ownerId \?\? currentUserId\(\)/);
    expect(src).toMatch(/ownerId: action\.ownerId \?\? currentUserId\(\)/);
  });

  it("чужая запись не отправляется", () => {
    // Главное условие: сервер записывает автора из сессии, поэтому отправить
    // чужую запись — значит приписать её не тому человеку.
    expect(src).toMatch(/entry\.ownerId != null && currentUserId != null && entry\.ownerId !== currentUserId/);
  });

  it("записи без владельца по-прежнему уходят", () => {
    // Созданные до этой правки. Отбросить их значило бы потерять работу,
    // уже сделанную в поле.
    const fn = src.slice(src.indexOf("function shouldAutoSync"));
    expect(fn.slice(0, 600)).toContain("entry.ownerId != null");
  });

  it("выход из аккаунта чистит кэши, но не очередь", () => {
    const auth = read("src/store/auth.ts");
    expect(auth).toContain("clearUserScopedCaches");
    for (const key of ["cached_products", "recent_shops", "order_draft", "visit_draft_"]) {
      expect(auth).toContain(key);
    }
    // Очереди отправки трогать нельзя: это несделанная работа.
    expect(auth).not.toContain("pending_orders");
    expect(auth).not.toContain("pending_delivery_actions");
  });
});

describe("сбой загрузки не выглядит как пустой день", () => {
  it("экран доставок отличает ошибку от отсутствия заказов", () => {
    const src = read("app/(tabs)/deliveries.tsx");
    // Без ветки ошибки список выходил пустым, и экран честно рисовал
    // «Ожидают 0 / В пути 0». Курьер делал единственный разумный вывод —
    // что маршрут не назначили — и уезжал.
    expect(src).toContain("isError");
    expect(src).toContain("Не удалось загрузить доставки");
  });

  it("экран плана отличает ошибку от отсутствия визитов", () => {
    const src = read("app/(tabs)/plan.tsx");
    expect(src).toContain("plansError");
    expect(src).toContain("Не удалось загрузить план");
  });

  it("несохранённая отметка визита показывается агенту", () => {
    const src = read("app/(tabs)/plan.tsx");
    const mutation = src.slice(src.indexOf("const updateMutation"));
    // Молчание здесь стоило агенту KPI: посещаемость весит 30%, а отметки
    // просто не доходили.
    expect(mutation.slice(0, 900)).toContain("onError");
  });
});

describe("напоминания о визитах", () => {
  const src = read("src/hooks/useVisitReminders.ts");

  it("не сносят все уведомления приложения", () => {
    // cancelAllScheduledNotificationsAsync убирал в том числе чужие
    // уведомления — например, пуши о назначенных доставках.
    // Ищется ВЫЗОВ, а не упоминание: имя осталось в комментарии как
    // объяснение прежнего поведения.
    expect(src).not.toMatch(/cancelAllScheduledNotificationsAsync\(/);
  });

  it("не раскладываются с шагом в пять минут от «сейчас»", () => {
    // У плана визита есть только дата, времени нет — «напомнить заранее»
    // данные не поддерживают. Прежний код рассылал по уведомлению на визит
    // подряд, и агент за рулём получал их каждые пять минут.
    expect(src).not.toMatch(/idx \+ 1\) \* 5 \* 60 \* 1000/);
  });

  it("одно уведомление с постоянным идентификатором", () => {
    // Постоянный идентификатор заменяет прежнее уведомление, поэтому
    // повторный запуск эффекта не плодит копии.
    expect(src).toContain("REMINDER_ID");
    expect(src).toContain("identifier: REMINDER_ID");
  });

  it("эффект зависит от числа, а не от массива планов", () => {
    // На массиве эффект перезапускался при каждом обновлении запроса — в том
    // числе после каждой отметки «Посещён», которая его инвалидирует.
    expect(src).toContain("[isAuthenticated, plannedCount]");
  });
});

describe("длинные списки виртуализированы", () => {
  it("магазины рисуются FlatList, а не ScrollView с map", () => {
    const src = read("app/(tabs)/shops.tsx");
    // Шестьсот карточек разом — это ещё и шестьсот параллельных запросов за
    // фотографиями по сотовой сети, ради шести видимых.
    expect(src).not.toMatch(/\{filtered\.map\(/);
    expect(src).not.toMatch(/\{selectedShops\.map\(/);
    expect(src).toContain("data={filtered}");
    expect(src).toContain("data={selectedShops}");
  });
});
