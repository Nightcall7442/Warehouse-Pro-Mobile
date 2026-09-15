/**
 * Списки открываются сверху — и при возврате на вкладку, и при смене отбора.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Жалоба владельца: «список не возвращается к началу, а открывается с
 * середины или конца — везде, и в мобилке тоже». useScrollTopOnFocus стоял у
 * двух экранов из семи; при смене поиска, категории, сортировки список не
 * возвращался к началу нигде.
 *
 * Стережётся хук и то, что он стоит у КАЖДОГО экрана-списка во вкладках:
 * новый экран без него вернёт жалобу.
 */
import { renderHook } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { useScrollTopOnChange, scrollListTop } from "../hooks/useScrollTopOnChange";

const TABS = join(__dirname, "..", "..", "app", "(tabs)");
const read = (f: string) => readFileSync(join(TABS, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("хук: к началу при смене отбора", () => {
  it("первый показ список не трогает, смена отбора — прокручивает к нулю без анимации", () => {
    const scrollToOffset = jest.fn();
    const ref = { current: { scrollToOffset } };
    const h = renderHook(({ q }) => useScrollTopOnChange(ref, [q]), { initialProps: { q: "" } });
    expect(scrollToOffset).not.toHaveBeenCalled();
    h.rerender({ q: "вода" });
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  });

  it("ScrollView без scrollToOffset — через scrollTo; пустой ref — без ошибки", () => {
    const scrollTo = jest.fn();
    scrollListTop({ scrollTo });
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(() => scrollListTop(null)).not.toThrow();
  });
});

describe("хуки стоят у каждого экрана-списка во вкладках", () => {
  const withList = ["orders.tsx", "shops.tsx", "catalog.tsx", "debtors.tsx", "targets.tsx", "deliveries.tsx", "plan.tsx"];
  const withFilters = ["shops.tsx", "catalog.tsx", "debtors.tsx", "targets.tsx"];

  it.each(withList)("%s возвращает список к началу при возврате на вкладку", (f) => {
    const src = read(f);
    expect(src).toMatch(/useScrollTopOnFocus\(/);
    expect(src).toMatch(/ref=\{(listRef|scrollRef)/);
  });

  it.each(withFilters)("%s возвращает список к началу при смене отбора", (f) => {
    expect(read(f)).toMatch(/useScrollTopOnChange\(listRef, \[/);
  });
});
