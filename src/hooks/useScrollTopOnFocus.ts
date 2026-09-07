import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Показать экран сверху, когда на вкладку вернулись.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Жалоба владельца: «при смене таббара табы не показываются самым вверху».
 *
 * Вкладки expo-router не размонтируют экран — он остаётся висеть вместе со
 * своим положением прокрутки. Агент листает «Заказы» до вчерашних, уходит в
 * «Каталог», возвращается — и попадает не в начало списка, а туда же, где был.
 * Сверху при этом лежат сегодняшние заказы, ради которых он и вернулся, и их
 * не видно.
 *
 * Хуже того, это ломает и обновление: [[useRefreshOnFocus]] честно перечитывает
 * данные, новые строки встают в начало списка — а человек смотрит в середину и
 * решает, что ничего не обновилось. Отсюда «не обновляются» в той же жалобе.
 *
 * ── Почему без плавности ────────────────────────────────────────────────────
 *
 * `animated: false`. Прокрутка на глазах у человека читается как «экран уехал
 * сам» — он не понимает, кто это сделал и не потерял ли он место. Мгновенный
 * переход к началу читается как «открылось заново», а это и есть правда.
 *
 * ── Почему не размонтированием ──────────────────────────────────────────────
 *
 * Соблазн поставить вкладкам unmountOnBlur: тогда и прокрутка, и данные
 * сбрасывались бы сами. Но вместе с ними сбросится и то, что человек набрал:
 * корзина в каталоге, фильтры, наполовину заполненная форма. Прокрутка — не
 * повод терять работу.
 */

/** Всё, что умеет прокручиваться: ScrollView, FlatList, SectionList. */
interface Scrollable {
  scrollTo?: (options: { y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
  scrollToLocation?: (options: { sectionIndex: number; itemIndex: number; animated?: boolean }) => void;
}

export function useScrollTopOnFocus(ref: React.RefObject<Scrollable | null>): void {
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      // Первый показ и так начинается сверху; дёргать список незачем.
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      const list = ref.current;
      if (!list) return;

      if (typeof list.scrollToOffset === "function") {
        list.scrollToOffset({ offset: 0, animated: false });
      } else if (typeof list.scrollTo === "function") {
        list.scrollTo({ y: 0, animated: false });
      } else if (typeof list.scrollToLocation === "function") {
        /*
          У SectionList своего «в начало» нет: scrollToOffset он не отдаёт, а
          scrollToLocation на пустых секциях бросает исключение. Поэтому вызов
          обёрнут — пустой список и так показан сверху, ронять из-за него экран
          нельзя.
        */
        try {
          list.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: false });
        } catch { /* нечего прокручивать */ }
      }
    }, [ref]),
  );
}
