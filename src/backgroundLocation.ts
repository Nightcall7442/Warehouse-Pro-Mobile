import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { saveLocation } from "./api";

const BACKGROUND_LOCATION_TASK = "background-location-task";

// Track consecutive errors for backoff
let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 300_000; // 5 minutes max backoff

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await saveLocation(
      location.coords.latitude,
      location.coords.longitude,
      location.coords.accuracy ?? 999
    );
    consecutiveErrors = 0; // Reset on success
  } catch (e) {
    consecutiveErrors++;
    console.error(`Background location error (attempt ${consecutiveErrors}):`, e);

    // If too many consecutive errors, stop tracking to save battery
    if (consecutiveErrors >= 5) {
      console.warn("Too many consecutive background location errors, stopping tracking");
      await stopBackgroundTracking();
    }
  }
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
    consecutiveErrors = 0;
    return { success: true };
  } catch (e) {
    console.error("Failed to start background tracking:", e);
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
    console.error("Failed to stop background tracking:", e);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}
