import { useEffect, useRef } from "react";

/**
 * Показать список сверху, когда сменился отбор.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Жалоба владельца: «при переходе список не возвращается к началу, а
 * открывается с середины или конца — везде, и в мобилке тоже».
 *
 * FlatList помнит положение прокрутки сам по себе: человек пролистал каталог
 * до конца, нажал другую категорию — и смотрит на конец нового списка,
 * а первые товары категории где-то выше. То же с поиском, сортировкой,
 * сроком долга. Список подменился, а глаз остался на старом месте.
 *
 * Хук тот же по смыслу, что и [[useScrollTopOnFocus]]: тот возвращает
 * к началу при возврате на вкладку, этот — при смене того, по чему список
 * отобран. Без плавности: мгновенный переход читается как «открылось
 * заново», плавный — как «экран уехал сам».
 */
interface Scrollable {
  scrollTo?: (options: { y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
}

export function scrollListTop(list: Scrollable | null | undefined): void {
  if (!list) return;
  if (typeof list.scrollToOffset === "function") list.scrollToOffset({ offset: 0, animated: false });
  else if (typeof list.scrollTo === "function") list.scrollTo({ y: 0, animated: false });
}

export function useScrollTopOnChange(ref: React.RefObject<Scrollable | null>, deps: readonly unknown[]): void {
  const first = useRef(true);
  useEffect(() => {
    // Первый показ и так начинается сверху.
    if (first.current) { first.current = false; return; }
    scrollListTop(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
