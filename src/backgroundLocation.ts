import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { saveLocation } from "./api";

const BACKGROUND_LOCATION_TASK = "background-location-task";

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
  } catch (e) {
    console.error("Background location error:", e);
  }
});

export async function startBackgroundTracking(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== "granted") return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        deferredUpdatesInterval: 120_000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Warehouse Pro",
          notificationBody: "Геолокация активна",
          notificationColor: "#4b6cf6",
        },
      });
    }
    return true;
  } catch (e) {
    console.error("Failed to start background tracking:", e);
    return false;
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
