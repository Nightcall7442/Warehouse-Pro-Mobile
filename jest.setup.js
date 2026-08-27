/**
 * Нативные модули Expo, которых в тестах нет.
 *
 * ── Что происходило ─────────────────────────────────────────────────────────
 *
 * Тест «остаток дочитывается из каталога» падал примерно в одном прогоне из
 * трёх — и только на ПОЛНОМ наборе, в одиночку и вдвоём с соседом проходил
 * всегда. В выводе при этом стояло:
 *
 *     An error occurred while requiring the 'ExpoModulesCoreJSLogger' module:
 *     Cannot read properties of undefined (reading 'get')
 *     > 1 | import * as TaskManager from "expo-task-manager";
 *
 * То есть падал не тест, а загрузка нативного слоя: экран заказа тянет за
 * собой хранилище сессии, оно — модуль фоновой геолокации, а тот на первой же
 * строке просит TaskManager, Location и Battery. В jsdom нативной части нет, и
 * инициализация иногда не успевала выдать заглушку до обращения к ней —
 * отсюда и «то падает, то нет».
 *
 * Гоняться за таймаутами было бы лечением симптома: дело не в скорости, а в
 * том, что тестам эти модули не нужны вовсе. Здесь они подменяются на весь
 * набор — заглушки достаточные, чтобы код, который их зовёт, отработал, и
 * достаточно пустые, чтобы ничего не изображать сверх этого.
 */

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => {}),
}));

jest.mock("expo-location", () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  startLocationUpdatesAsync: jest.fn(async () => {}),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 41.3, longitude: 69.24, accuracy: 10 },
    timestamp: 0,
  })),
}));

jest.mock("expo-battery", () => ({
  getBatteryLevelAsync: jest.fn(async () => 1),
}));
