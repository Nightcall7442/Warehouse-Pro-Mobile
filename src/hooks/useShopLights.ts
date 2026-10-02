import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getShopLight, getShopLights, type ShopLight } from "../api";
import { useAuthStore } from "../store/auth";
import { recallLights, rememberLights, type CachedLight } from "../lib/shop-light-cache";

/*
  Светофор магазина с сервера, а без связи — последний полученный.

  savedAt: null — ответ свежий; строка — светофор из памяти или с диска, и
  экран обязан сказать «на {время}»: по нему агент разговаривает с хозяином
  магазина, и выдать вчерашнее за сегодняшнее молча нельзя (тот же довод, что
  у копии каталога, hooks/useOfflineCopy).
*/
export interface LightEntry {
  light: ShopLight;
  savedAt: string | null;
}

/** Отложенные светофоры магазинов — читаются один раз на человека и набор. */
function useCached(ownerId: number | null, ids: number[], enabled: boolean): Map<number, CachedLight> {
  const slot = `${ownerId}|${ids.join(",")}`;
  const [cached, setCached] = useState<{ slot: string; map: Map<number, CachedLight> } | null>(null);
  useEffect(() => {
    if (!enabled || ownerId == null || ids.length === 0) return;
    let cancelled = false;
    void recallLights(ownerId, ids).then(map => { if (!cancelled) setCached({ slot, map }); });
    return () => { cancelled = true; };
    // ids входят в slot — отдельная зависимость не нужна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, enabled]);
  return cached && cached.slot === slot ? cached.map : EMPTY;
}
const EMPTY = new Map<number, CachedLight>();

/** Светофор одного магазина — для карточки. null — блока нет (чужой магазин или нечего показать). */
export function useShopLight(shopId: number, enabled: boolean): LightEntry | null {
  const ownerId = useAuthStore(s => s.user?.id ?? null);
  const on = enabled && Number.isFinite(shopId) && shopId > 0;
  const q = useQuery({
    queryKey: ["shopLight", shopId],
    queryFn: () => getShopLight(shopId),
    enabled: on,
    retry: false,
    staleTime: 60_000,
  });
  const ids = useMemo(() => (on ? [shopId] : []), [on, shopId]);
  const cached = useCached(ownerId, ids, on);

  useEffect(() => {
    if (q.data && ownerId != null) void rememberLights(ownerId, [q.data]);
  }, [q.data, ownerId]);

  if (!on) return null;
  // Сервер ответил: светофор есть — свежий; null — магазин не наш, блока нет.
  if (q.status === "success") return q.data ? { light: q.data, savedAt: null } : null;
  // Повтор сорвался, а прежний ответ в памяти — его, с временем получения.
  if (q.data) return { light: q.data, savedAt: new Date(q.dataUpdatedAt).toISOString() };
  const c = cached.get(shopId);
  return c ? { light: c.light, savedAt: c.savedAt } : null;
}

/**
 * Светофоры списка — одним запросом shop.lights на весь список, а не по
 * запросу на строку. Номера сортируются: порядок строк меняется (по
 * расстоянию, по территории), а набор тот же — второго запроса быть не должно.
 */
export function useShopLights(shopIds: number[], enabled: boolean): Map<number, LightEntry> {
  const ownerId = useAuthStore(s => s.user?.id ?? null);
  const ids = useMemo(
    () => (enabled ? [...new Set(shopIds.filter(id => id > 0))].sort((a, b) => a - b).slice(0, 500) : []),
    [shopIds, enabled],
  );
  const on = ids.length > 0;
  const q = useQuery({
    queryKey: ["shopLights", ids],
    queryFn: () => getShopLights(ids),
    enabled: on,
    retry: false,
    staleTime: 60_000,
  });
  const cached = useCached(ownerId, ids, on);

  useEffect(() => {
    if (q.data && ownerId != null) void rememberLights(ownerId, q.data);
  }, [q.data, ownerId]);

  return useMemo(() => {
    const out = new Map<number, LightEntry>();
    if (!on) return out;
    if (q.data) {
      const at = q.status === "success" ? null : new Date(q.dataUpdatedAt).toISOString();
      for (const l of q.data) out.set(l.shopId, { light: l, savedAt: at });
      return out;
    }
    for (const [id, c] of cached) out.set(id, { light: c.light, savedAt: c.savedAt });
    return out;
  }, [on, q.data, q.status, q.dataUpdatedAt, cached]);
}
