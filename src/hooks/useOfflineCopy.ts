import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";
import { saveOfflineCopy, loadOfflineCopy, type OfflineKind } from "../lib/offline-copy";

/**
 * Данные с сервера, а без связи — отложенная копия.
 *
 * Пришло с сервера — показываем его и заодно откладываем копию. Не пришло и
 * показывать нечего — достаём отложенную. Так агент в подсобке без связи видит
 * магазины и каталог и может собрать заказ, а не пустой экран: очередь
 * неотправленных заказов для этого уже написана, не хватало только данных,
 * чтобы заказ начать.
 *
 * Возвращает ещё и признак «это копия» с датой. Экран обязан об этом сказать:
 * по остаткам и ценам агент разговаривает с хозяином магазина, и выдавать
 * вчерашнее за сегодняшнее молча нельзя.
 *
 * scope — чей каталог: магазин (и прайс-лист). У каждого магазина свои цены,
 * и копия отдаётся только его (lib/offline-copy). cardPrices — цен этого
 * магазина без связи нет, показаны цены карточки.
 */
export function useOfflineCopy<T>(kind: OfflineKind, live: T | undefined, scope?: string): {
  data: T | undefined;
  fromCopy: boolean;
  savedAt: string | null;
  cardPrices: boolean;
} {
  const ownerId = useAuthStore(s => s.user?.id ?? null);
  // Чья копия лежит в состоянии. Магазин сменили — прежняя копия ещё здесь,
  // пока читается новая, и без этой метки её цены показались бы для нового.
  const slot = `${kind}|${ownerId}|${scope ?? ""}`;
  const [copy, setCopy] = useState<{ slot: string; data: T; savedAt: string; cardPrices?: boolean } | null>(null);

  // Копия читается один раз: она нужна как запасной путь, живые данные её
  // всё равно перекроют. Чтение из внешнего хранилища — ровно то, ради чего
  // эффекты и существуют.
  useEffect(() => {
    let cancelled = false;
    // Без хозяина копии нет. Сбрасываем той же дорогой, что и читаем:
    // синхронный setState прямо в эффекте дал бы лишний проход отрисовки.
    const found = ownerId == null ? Promise.resolve(null) : loadOfflineCopy<T>(kind, ownerId, scope);
    void found.then(value => { if (!cancelled) setCopy(value && { ...value, slot }); });
    return () => { cancelled = true; };
  }, [kind, ownerId, scope, slot]);

  // Пришли живые — откладываем. Пустой ответ не откладываем: он затёр бы
  // рабочую копию тем, из чего заказ не соберёшь.
  useEffect(() => {
    if (live === undefined || ownerId == null) return;
    if (Array.isArray(live) && live.length === 0) return;
    void saveOfflineCopy(kind, ownerId, live, scope);
  }, [kind, live, ownerId, scope]);

  if (live !== undefined) return { data: live, fromCopy: false, savedAt: null, cardPrices: false };
  if (copy && copy.slot === slot) return { data: copy.data, fromCopy: true, savedAt: copy.savedAt, cardPrices: copy.cardPrices === true };
  return { data: undefined, fromCopy: false, savedAt: null, cardPrices: false };
}
