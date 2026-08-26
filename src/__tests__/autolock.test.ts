// Warehouse Pro — блокировка по простою
//
// Главная проверка здесь одна: неудачное подтверждение личности НЕ должно
// стирать сессию. Раньше стирало — useAutoLock вызывал logout() на любой
// неуспех authenticateAsync, а неуспехом считались и нажатие «Назад», и
// отсутствие зарегистрированного отпечатка, и несколько неточных касаний.
// Агенты жаловались, что приложение выкидывает их из аккаунта и заставляет
// заново вводить пароль; чаще всего — после оформления заказа, потому что это
// самый долгий сценарий, и пять минут в фоне набегали именно на нём.

let mockAppStateHandler: ((s: string) => void | Promise<void>) | null = null;

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, handler: (s: string) => void) => {
      mockAppStateHandler = handler;
      return { remove: jest.fn() };
    },
  },
}));

const mockStorage: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStorage[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete mockStorage[k]; }),
  },
}));

let mockBiometricEnabled = "true";
jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(async () => mockBiometricEnabled),
    setItemAsync: jest.fn(async () => {}),
    deleteItemAsync: jest.fn(async () => {}),
  },
}));

let mockHasHardware = true;
let mockIsEnrolled = true;
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => mockHasHardware),
  isEnrolledAsync: jest.fn(async () => mockIsEnrolled),
  authenticateAsync: jest.fn(async () => ({ success: false, error: "user_cancel" })),
}));

const { renderHook } = require("@testing-library/react");
const { useAutoLock } = require("../hooks/useAutoLock");
const { useAuthStore } = require("../store/auth");
const { useLockStore } = require("../store/lock");

const IDLE = 5 * 60 * 1000;

/** Свернуть приложение, подождать `awayMs` и вернуть обратно. */
async function goAwayAndBack(awayMs: number) {
  const now = Date.now();
  jest.spyOn(Date, "now").mockReturnValue(now);
  await mockAppStateHandler!("background");
  jest.spyOn(Date, "now").mockReturnValue(now + awayMs);
  await mockAppStateHandler!("active");
  (Date.now as jest.Mock).mockRestore?.();
}

beforeEach(() => {
  mockAppStateHandler = null;
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  mockBiometricEnabled = "true";
  mockHasHardware = true;
  mockIsEnrolled = true;
  useLockStore.setState({ locked: false });
  useAuthStore.setState({ user: { id: 1, name: "Агент" }, isAuthenticated: true, isLoading: false });
  jest.clearAllMocks();
});

describe("useAutoLock", () => {
  it("запирает экран после долгого простоя, когда биометрия включена и настроена", async () => {
    renderHook(() => useAutoLock());
    await goAwayAndBack(IDLE + 1000);
    expect(useLockStore.getState().locked).toBe(true);
  });

  it("не запирает, если отсутствовали меньше пяти минут", async () => {
    renderHook(() => useAutoLock());
    await goAwayAndBack(60 * 1000);
    expect(useLockStore.getState().locked).toBe(false);
  });

  it("не запирает, если пользователь не включал биометрию", async () => {
    mockBiometricEnabled = null as unknown as string;
    renderHook(() => useAutoLock());
    await goAwayAndBack(IDLE + 1000);
    expect(useLockStore.getState().locked).toBe(false);
  });

  // Тот самый телефон, из-за которого всё и началось: датчик есть, палец не
  // зарегистрирован, PIN не задан. Прежний код гасил сессию здесь каждый раз.
  it("не запирает телефон без зарегистрированного отпечатка", async () => {
    mockIsEnrolled = false;
    renderHook(() => useAutoLock());
    await goAwayAndBack(IDLE + 1000);
    expect(useLockStore.getState().locked).toBe(false);
  });

  it("не запирает, когда датчика нет вовсе", async () => {
    mockHasHardware = false;
    renderHook(() => useAutoLock());
    await goAwayAndBack(IDLE + 1000);
    expect(useLockStore.getState().locked).toBe(false);
  });

  // Ради этого весь файл: блокировка не имеет права трогать сессию.
  it("НЕ выходит из аккаунта ни при каком исходе", async () => {
    renderHook(() => useAutoLock());

    for (const [hw, enrolled, enabled] of [
      [true, true, "true"],
      [true, false, "true"],
      [false, false, "true"],
      [true, true, null],
    ] as [boolean, boolean, string | null][]) {
      mockHasHardware = hw;
      mockIsEnrolled = enrolled;
      mockBiometricEnabled = enabled as unknown as string;
      await goAwayAndBack(IDLE + 1000);

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user).not.toBeNull();
      useLockStore.setState({ locked: false });
    }
  });

  it("не запирает неавторизованного — запирать нечего", async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    renderHook(() => useAutoLock());
    // Слушатель не вешается вовсе, когда пользователь не вошёл.
    expect(mockAppStateHandler).toBeNull();
    expect(useLockStore.getState().locked).toBe(false);
  });
});
