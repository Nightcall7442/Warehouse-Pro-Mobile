/**
 * Долги магазинов у супервайзера.
 *
 * ── Что здесь на самом деле проверяется ─────────────────────────────────────
 *
 * Порядок списка. Он выглядит косметикой, а решает про деньги: супервайзер
 * смотрит первые несколько строк и едет по ним. Отсортируй по сумме — сверху
 * окажется крупный магазин, который просто много берёт и платит исправно, а
 * полугодовой долг маленькой точки уедет вниз и не будет виден никогда.
 *
 * И отдельно — что долг БЕЗ привязки к заказу не выглядит свежим. Его возраст
 * неизвестен (начислен руками, заказа за ним нет), и показать его в корзине
 * «до 7 дней» значило бы убрать с глаз ровно то, за чем стоит присмотреть.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, bucketOf, sortDebtors, debtorTotals } from "../lib/debtors";
import type { ShopAging, ReceivablesAging } from "../api";

/** В Jest у expect один довод — причину пишем сами. */
function must(ok: boolean, why: string) {
  if (!ok) throw new Error(why);
}

const shop = (over: Partial<ShopAging>): ShopAging => ({
  shopId: 1, shopName: "Магазин", phone: null, agentName: null,
  debt: 0, buckets: { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 0 },
  unattributed: 0, oldestDays: null, ...over,
});

describe("возраст долга", () => {
  it("границы те же, что на сервере", () => {
    // 7 / 30 / 60 — расходиться им нельзя: человек увидел бы в корзине сумму,
    // посчитанную по другому правилу.
    expect(bucketOf(0)).toBe("d0_7");
    expect(bucketOf(7)).toBe("d0_7");
    expect(bucketOf(8)).toBe("d8_30");
    expect(bucketOf(30)).toBe("d8_30");
    expect(bucketOf(31)).toBe("d31_60");
    expect(bucketOf(60)).toBe("d31_60");
    expect(bucketOf(61)).toBe("d60plus");
  });

  it("неизвестный возраст — самая старая корзина, а не самая свежая", () => {
    /*
      Долг без заказа: начислен руками. Состарить его нечем, и «до 7 дней»
      было бы догадкой в пользу спокойствия — то есть в худшую сторону.
    */
    expect(bucketOf(null)).toBe("d60plus");
  });

  it("корзин ровно четыре и все названы", () => {
    expect(BUCKETS.map(b => b.key)).toEqual(["d0_7", "d8_30", "d31_60", "d60plus"]);
    for (const b of BUCKETS) must(b.label.length > 0, `у корзины ${b.key} нет подписи`);
  });
});

describe("порядок списка", () => {
  const old = shop({ shopId: 1, shopName: "Маленькая точка", debt: 300_000, oldestDays: 180 });
  const big = shop({ shopId: 2, shopName: "Большой магазин", debt: 9_000_000, oldestDays: 3 });
  const manual = shop({ shopId: 3, shopName: "Ручное начисление", debt: 500_000, oldestDays: null });

  it("по умолчанию сверху самые старые, а не самые крупные", () => {
    /*
      Главная проверка файла. Долг в 300 тысяч, висящий полгода, важнее девяти
      миллионов трёхдневных: первый почти не собирается, второй закроется сам.
    */
    const rows = sortDebtors([big, old, manual], { search: "", bucket: null, byAmount: false });
    expect(rows.map(r => r.shopId)).toEqual([3, 1, 2]);
  });

  it("по сумме — только когда попросили", () => {
    const rows = sortDebtors([old, big, manual], { search: "", bucket: null, byAmount: true });
    expect(rows.map(r => r.shopId)).toEqual([2, 3, 1]);
  });

  it("при равном возрасте вперёд идёт больший долг", () => {
    const a = shop({ shopId: 10, debt: 100, oldestDays: 40 });
    const b = shop({ shopId: 11, debt: 900, oldestDays: 40 });
    const rows = sortDebtors([a, b], { search: "", bucket: null, byAmount: false });
    expect(rows.map(r => r.shopId)).toEqual([11, 10]);
  });

  it("исходный список не переставляется на месте", () => {
    // Иначе второй экран, читающий тот же кэш запроса, получил бы чужой
    // порядок — и никто бы не понял, откуда он взялся.
    const list = [big, old];
    const before = list.map(r => r.shopId);
    sortDebtors(list, { search: "", bucket: null, byAmount: true });
    expect(list.map(r => r.shopId)).toEqual(before);
  });
});

describe("отбор", () => {
  const rows = [
    shop({ shopId: 1, shopName: "Нодира MCHJ", agentName: "Отабек", oldestDays: 3 }),
    shop({ shopId: 2, shopName: "Барака савдо", agentName: "Санжар", oldestDays: 45 }),
  ];

  it("ищет и по магазину, и по агенту", () => {
    // Супервайзер спрашивает и «где Нодира», и «что у Отабека».
    expect(sortDebtors(rows, { search: "нодира", bucket: null, byAmount: false }).map(r => r.shopId)).toEqual([1]);
    expect(sortDebtors(rows, { search: "санжар", bucket: null, byAmount: false }).map(r => r.shopId)).toEqual([2]);
  });

  it("корзина отбирает по возрасту", () => {
    expect(sortDebtors(rows, { search: "", bucket: "d31_60", byAmount: false }).map(r => r.shopId)).toEqual([2]);
    expect(sortDebtors(rows, { search: "", bucket: "d0_7", byAmount: false }).map(r => r.shopId)).toEqual([1]);
  });

  it("магазин без агента из списка не пропадает", () => {
    // Он-то и опаснее: долг есть, спрашивать не с кого.
    const orphan = shop({ shopId: 3, shopName: "Ничей", agentName: null });
    expect(sortDebtors([orphan], { search: "", bucket: null, byAmount: false })).toHaveLength(1);
  });
});

describe("итоги", () => {
  const data: ReceivablesAging = {
    totalDebt: 10_000_000,
    buckets: { d0_7: 1_000_000, d8_30: 2_000_000, d31_60: 3_000_000, d60plus: 3_500_000 },
    unattributed: 500_000,
    debtorCount: 12,
    shops: [],
  };

  it("просроченным считается старше месяца", () => {
    // Тот же срок, что и на сервере: месяц — когда агент едет разговаривать.
    expect(debtorTotals(data).overdue).toBe(6_500_000);
  });

  it("не привязанное к заказу в просрочку НЕ попадает", () => {
    /*
      Оно может быть и вчерашним: возраст у него неизвестен. Назвать его
      просроченным значило бы придумать — ровно то, чего в этом продукте
      делать нельзя.
    */
    const totals = debtorTotals(data);
    expect(totals.overdue).not.toBe(6_500_000 + data.unattributed);
    expect(totals.unattributed).toBe(500_000);
  });

  it("корзины и неотнесённое дают ровно долг", () => {
    // Отчёт, части которого не сходятся с итогом, хуже отсутствующего.
    const t = debtorTotals(data);
    const sum = t.buckets.d0_7 + t.buckets.d8_30 + t.buckets.d31_60 + t.buckets.d60plus + t.unattributed;
    expect(sum).toBe(t.totalDebt);
  });

  it("пустой ответ не роняет экран", () => {
    const t = debtorTotals(undefined);
    expect(t.totalDebt).toBe(0);
    expect(t.overdue).toBe(0);
    expect(t.buckets.d60plus).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   До экрана надо ДОЙТИ, и сервер должен его пустить.
   ═══════════════════════════════════════════════════════════════════════════ */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const TABS = read("src/lib/tabs.ts");
const SCREEN = read("app/(tabs)/debtors.tsx");
const HOME = read("app/(tabs)/index.tsx");
const LAYOUT = read("app/(tabs)/_layout.tsx");
const API = read("src/api.ts");

describe("экран доступен", () => {
  it("вкладка есть у надзорных ролей", () => {
    const { isTabVisible } = jest.requireActual("../lib/tabs") as typeof import("../lib/tabs");
    for (const role of ["supervisor", "ceo", "operator"]) {
      must(isTabVisible("debtors", role), `роль ${role} не видит вкладку долгов`);
    }
  });

  it("и её нет у тех, кому сервер откажет", () => {
    /*
      shop.receivablesAging стоит на managementQuery — владелец, оператор,
      супервайзер. Вкладка, открывающая экран с отказом, хуже отсутствующей:
      это уже случалось со «Слежением».
    */
    const { isTabVisible } = jest.requireActual("../lib/tabs") as typeof import("../lib/tabs");
    for (const role of ["agent", "courier", "merchandiser"]) {
      must(!isTabVisible("debtors", role), `роль ${role} видит вкладку, которую сервер не отдаст`);
    }
    expect(TABS).toContain('name === "debtors"');
  });

  it("вкладка объявлена и подписана", () => {
    // Экран без записи в навигаторе не появится в панели вовсе.
    expect(LAYOUT).toContain('name="debtors"');
    expect(LAYOUT).toContain("debtors: \"Долги\"");
    expect(LAYOUT).toMatch(/debtors: "[a-z-]+"/);
  });

  it("карточка на главной ведёт на эту вкладку", () => {
    expect(HOME).toContain('router.push("/debtors")');
    expect(HOME).toContain("debtorTotals(aging)");
  });

  it("главная и вкладка берут один и тот же ответ", () => {
    // Один ключ запроса — значит открытая вкладка достаётся посчитанной, без
    // второго похода на сервер с телефона в поле.
    const key = 'queryKey: ["receivablesAging"]';
    expect(HOME).toContain(key);
    expect(SCREEN).toContain(key);
  });

  it("ручка названа та, что открыта этим ролям", () => {
    expect(API).toContain('trpcQuery<ReceivablesAging>("shop.receivablesAging")');
  });
});

describe("строка списка годится для работы, а не для чтения", () => {
  it("в ней есть телефон и агент", () => {
    // Долг закрывается звонком. Без номера супервайзер уходит искать его на
    // другой экран, и половина звонков не случается.
    expect(SCREEN).toContain("tel:${item.phone}");
    expect(SCREEN).toContain("item.agentName");
  });

  it("возраст показан, и неизвестный не выдаётся за ноль", () => {
    expect(SCREEN).toContain("item.oldestDays === null");
    expect(SCREEN).toContain("без привязки к заказу");
  });

  it("кнопки не мельче пальца", () => {
    /*
      Правило приложения: цель касания 44 точки.

      Проверяется, что НИ ОДНА высота не задана числом, а не «сколько раз
      встречается нужное слово». Счёт молчал, когда одну кнопку ужали до 24:
      остальные три слово сохранили, порог «не меньше трёх» сошёлся. Поймано
      нарочной поломкой.
    */
    const calls = [...SCREEN.matchAll(/minHeight: Sizes\.touchTarget/g)];
    must(calls.length >= 3, `цель касания задана лишь ${calls.length} раз — проверьте кнопки`);

    /*
      Ноль исключён намеренно: `minWidth: 0` — это не цель касания, а
      разрешение тексту сжиматься внутри строки. Ловим ровно то, что ловим:
      цель МЕНЬШЕ пальца.
    */
    const small = [...SCREEN.matchAll(/min(?:Height|Width): (\d+)/g)]
      .map(m => Number(m[1]))
      .filter(n => n > 0 && n < 44);
    must(
      small.length === 0,
      `цель касания задана числом (${small.join(", ")}) вместо Sizes.touchTarget — палец не попадёт`,
    );
  });
});
