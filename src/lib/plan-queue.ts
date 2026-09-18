import { useMemo } from "react";
import type { Plan } from "../api";
import { useVisitQueue, type VisitAction } from "../store/visit-queue";

/**
 * Планы с наложенной очередью визитов.
 *
 * Очередь никто не читал: отмеченный без связи визит оставался на экране
 * «запланирован» с живыми кнопками, прогресс дня его не считал, агент жал
 * «Готово» второй раз — вторая запись. А запись, отвергнутая сервером
 * (план назначен другому, подлог), висела на диске вечно и не показывалась
 * нигде — визит терялся, и никто об этом не знал.
 *
 * Ожидающая запись подменяет статус плана; отвергнутая план не трогает — под
 * ним видна причина и кнопки «Повторить» / «Убрать» (QueueNote).
 */
export function useQueuedPlans(plans: Plan[] | undefined): { plans: Plan[]; queued: Map<number, VisitAction> } {
  const actions = useVisitQueue(s => s.actions);
  return useMemo(() => {
    const queued = new Map<number, VisitAction>();
    for (const a of actions) if (!a.synced) queued.set(a.planId, a);
    const overlaid = (plans ?? []).map(p => {
      const a = queued.get(p.id);
      return a && !isRejected(a) && p.status === "planned" ? { ...p, status: a.status } : p;
    });
    return { plans: overlaid, queued };
  }, [plans, actions]);
}

/** Сервер отказал по существу — сама не уйдёт. */
export function isRejected(a: VisitAction): boolean {
  return a.status_ === "failed" && a.retryable === false;
}
