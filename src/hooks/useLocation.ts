import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { tt } from "../i18n";

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseLocationOptions {
  enabled?: boolean;
  accuracy?: Location.Accuracy;
}

interface UseLocationResult {
  location: LocationCoords | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLocation(options: UseLocationOptions = {}): UseLocationResult {
  const { enabled = true, accuracy = Location.Accuracy.Balanced } = options;
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status === "undetermined") {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") {
        setError(tt("Разрешение на геолокацию не выдано", "Joylashuvga ruxsat berilmagan"));
        setLoading(false);
        return;
      }

      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("GPS timeout")), 15_000)
        ),
      ]);
      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 999,
      });
    } catch {
      setError(tt("Не удалось определить местоположение", "Joylashuv aniqlanmadi"));
    } finally {
      setLoading(false);
    }
  }, [enabled, accuracy]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status === "undetermined") {
          ({ status } = await Location.requestForegroundPermissionsAsync());
        }
        if (status !== "granted") {
          if (!cancelled) setError(tt("Разрешение на геолокацию не выдано", "Joylashuvga ruxsat berilmagan"));
          return;
        }
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("GPS timeout")), 15_000)
          ),
        ]);
        if (!cancelled) {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 999,
          });
        }
      } catch {
        if (!cancelled) setError(tt("Не удалось определить местоположение", "Joylashuv aniqlanmadi"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [enabled, accuracy]);

  return { location, error, loading, refresh };
}

/**
 * Haversine formula — distance between two points in km
 */
export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimated travel time (30 km/h city average)
 */
export function getEstimatedTime(distanceKm: number): string {
  const minutes = Math.round((distanceKm / 30) * 60);
  if (minutes < 1) return tt("< 1 мин", "< 1 daq");
  if (minutes < 60) return tt(`${minutes} мин`, `${minutes} daq`);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return tt(`${hours} ч ${mins} мин`, `${hours} soat ${mins} daq`);
}
