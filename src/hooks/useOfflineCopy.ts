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
 */
export function useOfflineCopy<T>(kind: OfflineKind, live: T | undefined): {
  data: T | undefined;
  fromCopy: boolean;
  savedAt: string | null;
} {
  const ownerId = useAuthStore(s => s.user?.id ?? null);
  const [copy, setCopy] = useState<{ data: T; savedAt: string } | null>(null);

  // Копия читается один раз: она нужна как запасной путь, живые данные её
  // всё равно перекроют. Чтение из внешнего хранилища — ровно то, ради чего
  // эффекты и существуют.
  useEffect(() => {
    let cancelled = false;
    // Без хозяина копии нет. Сбрасываем той же дорогой, что и читаем:
    // синхронный setState прямо в эффекте дал бы лишний проход отрисовки.
    const found = ownerId == null ? Promise.resolve(null) : loadOfflineCopy<T>(kind, ownerId);
    void found.then(value => { if (!cancelled) setCopy(value); });
    return () => { cancelled = true; };
  }, [kind, ownerId]);

  // Пришли живые — откладываем. Пустой ответ не откладываем: он затёр бы
  // рабочую копию тем, из чего заказ не соберёшь.
  useEffect(() => {
    if (live === undefined || ownerId == null) return;
    if (Array.isArray(live) && live.length === 0) return;
    void saveOfflineCopy(kind, ownerId, live);
  }, [kind, live, ownerId]);

  if (live !== undefined) return { data: live, fromCopy: false, savedAt: null };
  if (copy) return { data: copy.data, fromCopy: true, savedAt: copy.savedAt };
  return { data: undefined, fromCopy: false, savedAt: null };
}
