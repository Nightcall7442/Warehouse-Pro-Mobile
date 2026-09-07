/**
 * Состояние названо словом, и словарь на приложение один.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Состояние доставки было выписано ДВАЖДЫ — на вкладке доставок и на главной
 * курьера, — и обе копии знали четыре значения из пяти. Не хватало
 * «not_assigned»: заказ, которому курьера ещё не назначили, показывался
 * курьеру английским словом «not_assigned».
 *
 * Способы оплаты были выписаны ТРИЖДЫ, и все три расходились с вебом:
 * «Перевод» здесь против «Перечисление» там. Один заказ у агента в телефоне и
 * у оператора на экране назывался по-разному.
 *
 * ── Почему проверка, а не три правки ────────────────────────────────────────
 *
 * Потому что копия заводится не от небрежности, а от удобства: экрану нужна
 * подпись, словарь в четыре строки пишется быстрее, чем ищется общий. И
 * отстаёт он не сразу. Ровно так в вебе набралось восемь словарей состояния
 * заказа, два из которых не знали «delivered» — то есть состояния, в котором
 * заказ проводит остаток жизни.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import {
  ORDER_STATUSES, DELIVERY_STATUSES, PAYMENT_METHODS,
  orderStatusLabel, deliveryStatusLabel,
} from "../lib/order-status";

const ROOT = join(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (/^(node_modules|__tests__|\.git|\.expo|android|ios|dist)$/.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Пояснения выкидываются: правило про код, а не про рассказ о нём. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const FILES = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))].map(f => ({
  rel:  relative(ROOT, f).split("\\").join("/"),
  text: strip(readFileSync(f, "utf8")),
}));

describe("словарь состояний — один на приложение", () => {
  it("состояние доставки описано в одном месте", () => {
    const values = Object.keys(DELIVERY_STATUSES);
    // Строка словаря: `assigned: "Назначен"` или `assigned: { ... label: "…" }`.
    const dictLine = (s: string) =>
      new RegExp(`\\b${s}\\s*:\\s*("[А-Яа-яЁё]|\\{[^}]*label\\s*:\\s*")`);

    const offenders = FILES
      .filter(f => f.rel !== "src/lib/order-status.ts")
      .map(f => ({ rel: f.rel, hits: values.filter(v => dictLine(v).test(f.text)) }))
      .filter(f => f.hits.length >= 3)
      .map(f => `${f.rel}: ${f.hits.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("способ оплаты описан в одном месте", () => {
    const values = Object.keys(PAYMENT_METHODS);
    const dictLine = (s: string) =>
      new RegExp(`\\b${s}\\s*:\\s*("[А-Яа-яЁё]|\\{[^}]*label\\s*:\\s*")|label:\\s*"${s}"`);

    const offenders = FILES
      .filter(f => f.rel !== "src/lib/order-status.ts")
      .map(f => ({ rel: f.rel, hits: values.filter(v => dictLine(v).test(f.text)) }))
      .filter(f => f.hits.length >= 3)
      .map(f => `${f.rel}: ${f.hits.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("у доставки названы все пять состояний, включая «курьер не назначен»", () => {
    /*
      Список не выдуман: это перечисление orders.delivery_status на сервере.
      Если оно пополнится, а словарь — нет, курьер увидит английское слово, и
      узнают об этом от него, а не отсюда. Отсюда — раньше.
    */
    for (const v of ["not_assigned", "assigned", "out_for_delivery", "delivered", "failed"]) {
      expect(DELIVERY_STATUSES[v]).toBeTruthy();
    }
  });

  it("незнакомое значение показывается кодом, а не соседней подписью", () => {
    expect(deliveryStatusLabel("teleported")).toBe("teleported");
    expect(orderStatusLabel("quantum_state")).toBe("quantum_state");
    expect(orderStatusLabel(null)).toBe("—");
  });

  it("слова совпадают с теми, что показывает веб", () => {
    // Агент читает «Доставлен» в телефоне, оператор — «Доставлен» на экране.
    expect(ORDER_STATUSES.delivered.label).toBe("Доставлен");
    expect(DELIVERY_STATUSES.delivered).toBe("Доставлен");
    expect(PAYMENT_METHODS.transfer).toBe("Перечисление");
  });
});
