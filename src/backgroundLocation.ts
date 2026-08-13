import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveLocation } from "./api";

const BACKGROUND_LOCATION_TASK = "background-location-task";

/**
 * Points we captured but couldn't upload yet.
 *
 * An agent's route runs through places with no signal, and a dropped point is a
 * hole in the route history that nothing can reconstruct later. The buffer is
 * capped so a long dead zone can't grow it without bound — oldest points go
 * first, since the recent ones are what the office actually looks at.
 */
const PENDING_KEY = "pending_locations";
const PENDING_MAX = 200;

interface PendingPoint {
  lat: number;
  lng: number;
  accuracy: number;
  batteryLevel?: number;
  /**
   * Когда точка снята, в формате ISO.
   *
   * Буфер копится, пока агент вне зоны покрытия, и заливается пачкой при
   * первом сигнале. Без этого поля сервер ставил время получения: на карте
   * агент весь день «стоял» на месте последней связи, а в 17:40 мгновенно
   * проезжал весь маршрут, и ответить, где он был в два часа дня, было нечем.
   *
   * Необязательное: точки, уже лежащие в буфере со времён прежней версии,
   * времени съёмки не имеют, и отбрасывать их из-за этого нельзя.
   */
  recordedAt?: string;
}

async function readPending(): Promise<PendingPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPoint[]) : [];
  } catch {
    return [];
  }
}

async function writePending(points: PendingPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(points.slice(-PENDING_MAX)));
  } catch { /* buffer is best-effort */ }
}

/**
 * Did the server permanently reject the point, or should it be retried?
 *
 * No response at all means no signal — the normal condition out on a route.
 * A response means the server was reached, but only a definite client-side
 * rejection (bad coordinates etc., 4xx other than 401/403) means the point
 * itself is unsalvageable. 401/403 mean the session token needs refreshing,
 * not that the point was bad — discarding on those was wiping a whole day's
 * buffered route the moment the token expired mid-shift.
 */
function isPermanentlyRejected(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status == null) return false;
  if (status === 401 || status === 403) return false;
  return status >= 400 && status < 500;
}

/** Drain whatever the last dead zone left behind, oldest first. */
async function flushPending(): Promise<void> {
  const pending = await readPending();
  if (pending.length === 0) return;

  const remaining = [...pending];
  while (remaining.length > 0) {
    const point = remaining[0];
    try {
      await saveLocation(point.lat, point.lng, point.accuracy, point.batteryLevel, point.recordedAt);
      remaining.shift();
    } catch (e) {
      // Still offline, or session needs refreshing — stop draining and keep
      // the rest for the next fix. Only a point the server definitively
      // rejected as bad data is not worth retrying forever.
      if (isPermanentlyRejected(e)) remaining.shift();
      else break;
    }
  }
  await writePending(remaining);
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    if (__DEV__) console.error("Background location task error:", error);
    return;
  }

  // The OS hands us the fix(es) it already took. Calling getCurrentPositionAsync()
  // here instead — as this task used to — throws that away and forces a second,
  // slower acquisition that routinely times out indoors or in a warehouse, which
  // is precisely where agents spend their day.
  //
  // After a signal gap the OS delivers everything it accumulated as ONE batch
  // (that's what deferredUpdatesInterval buys) — taking only the last entry
  // silently dropped every other point in the gap, which is exactly the route
  // history a dead zone makes irreplaceable.
  const locations = (data as { locations?: Location.LocationObject[] } | null)?.locations;
  if (!locations || locations.length === 0) return;

  const battery = await Battery.getBatteryLevelAsync().catch(() => null);
  const batteryLevel = battery !== null ? Math.round(battery * 100) : undefined;
  const points: PendingPoint[] = locations.map((location) => ({
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 999,
    batteryLevel,
    // Время берётся у самой координаты, а не «сейчас»: система могла отдать
    // накопленную точку с задержкой, и её собственная метка точнее.
    recordedAt: new Date(location.timestamp).toISOString(),
  }));

  const toBuffer: PendingPoint[] = [];
  for (const point of points) {
    try {
      await saveLocation(point.lat, point.lng, point.accuracy, point.batteryLevel, point.recordedAt);
    } catch (e) {
      if (__DEV__) console.warn("Background location upload failed, buffering:", e);
      // Tracking deliberately stays on. The previous version stopped itself after
      // five consecutive failures — and since a lost connection produced exactly
      // that, driving through one dead zone silently killed GPS for the rest of
      // the day, with no way back until the agent reopened the GPS tab by hand.
      if (!isPermanentlyRejected(e)) toBuffer.push(point);
    }
  }
  if (toBuffer.length > 0) {
    const pending = await readPending();
    await writePending([...pending, ...toBuffer]);
  }
  await flushPending();
});

export async function startBackgroundTracking(): Promise<{ success: boolean; reason?: string }> {
  try {
    // Check foreground permission first
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      const { status: newFgStatus } = await Location.requestForegroundPermissionsAsync();
      if (newFgStatus !== "granted") {
        return { success: false, reason: "foreground_permission_denied" };
      }
    }

    // Request background permission
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== "granted") {
      return { success: false, reason: "background_permission_denied" };
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50, // Only update if moved 50m
        deferredUpdatesInterval: 120_000, // Max once per 2 minutes
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Warehouse Pro",
          notificationBody: "Геолокация активна",
          notificationColor: "#4b6cf6",
        },
      });
    }
    // Coming back into coverage is the natural moment to clear the backlog.
    void flushPending();
    return { success: true };
  } catch (e) {
    if (__DEV__) console.error("Failed to start background tracking:", e);
    return { success: false, reason: "unknown_error" };
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e) {
    if (__DEV__) console.error("Failed to stop background tracking:", e);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}
