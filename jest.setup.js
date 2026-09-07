/**
 * Хранилище zustand + persist на импорте тянет AsyncStorage, а его нативной
 * части в jest нет — набор падал ещё до первого теста с «NativeModule:
 * AsyncStorage is null». Подмена берётся готовая, из самого пакета: она хранит
 * значения в памяти, то есть ведёт себя как настоящее хранилище, а не как
 * набор пустышек.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

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

/**
 * TextEncoder/TextDecoder в среде jsdom.
 *
 * Тесты гоняются в jsdom, а он этих двух глобальных не даёт — они есть в
 * браузере и в node, но не в его подделке под браузер. До SDK 57 это никого не
 * трогало; в нём expo подменяет глобальный URL своей реализацией, та тянет
 * кодировщик на импорте, и десяток наборов перестал запускаться вовсе — ещё до
 * первой строки теста.
 *
 * Берутся настоящие, из node: подделка здесь была бы хуже отсутствия.
 */
const { TextEncoder, TextDecoder } = require("util");
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

/**
 * Отступы безопасной зоны в тестах.
 *
 * Нативной части у react-native-safe-area-context в jsdom нет, и любой экран,
 * считающий отступ от системной панели, падал на импорте — ещё до первой
 * проверки. Значения нулевые: тесты про отступы считают арифметику сами и
 * подставляют свои числа.
 */
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));
