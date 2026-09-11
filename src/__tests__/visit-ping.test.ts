/**
 * Отметка визита ставит точку на карту слежения — и никогда не мешает отметке.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * В agent_locations писали только фоновый сбор и вкладка «GPS», которую агент
 * жмёт руками. У агента с выключенным фоновым сбором визит отмечался, а на
 * карте у начальника не появлялось ничего: ни точки, ни маршрута. Тот видел
 * «визитов сегодня: 12» и пустую карту.
 *
 * От этих же точек зависит проверка на подлог: она сверяет расстояние до
 * магазина по точкам за день. Нет точек — сверять нечего, и отметка «был у
 * магазина» ничем не подтверждена.
 *
 * ── Что здесь проверяется ───────────────────────────────────────────────────
 *
 * Не столько отправка, сколько её БЕЗВРЕДНОСТЬ. Визит к моменту вызова уже
 * отмечен, и эта дописка не должна ни падать наружу, ни висеть, ни показывать
 * системное окно доступа поверх успешного действия. Всё это ломает работу
 * агента ради дополнения к ней.
 */
import { sendVisitPing } from "../lib/visit-ping";

const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockGetBatteryLevelAsync = jest.fn();
const mockSaveLocation = jest.fn();

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: (...a: unknown[]) => mockGetForegroundPermissionsAsync(...a),
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestForegroundPermissionsAsync(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockGetCurrentPositionAsync(...a),
  Accuracy: { Balanced: 3 },
}));
jest.mock("expo-battery", () => ({
  getBatteryLevelAsync: (...a: unknown[]) => mockGetBatteryLevelAsync(...a),
}));
jest.mock("../api", () => ({
  saveLocation: (...a: unknown[]) => mockSaveLocation(...a),
}));

const position = {
  coords: { latitude: 41.31, longitude: 69.24, accuracy: 12 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockGetCurrentPositionAsync.mockResolvedValue(position);
  mockGetBatteryLevelAsync.mockResolvedValue(0.73);
  mockSaveLocation.mockResolvedValue(undefined);
});

describe("подменённые координаты", () => {
  it("признак mocked от системы доходит до сервера", async () => {
    mockGetCurrentPositionAsync.mockResolvedValue({ ...position, mocked: true });
    await sendVisitPing();
    expect(mockSaveLocation.mock.calls[0][5]).toBe(true);
  });

  it("без признака — false, а не undefined-как-повезёт", async () => {
    await sendVisitPing();
    expect(mockSaveLocation.mock.calls[0][5]).toBe(false);
  });
});

describe("точка при отметке визита", () => {
  it("уходит с координатами, точностью и зарядом", async () => {
    await sendVisitPing();

    expect(mockSaveLocation).toHaveBeenCalledTimes(1);
    const [lat, lng, accuracy, battery, recordedAt] = mockSaveLocation.mock.calls[0];
    expect(lat).toBe(41.31);
    expect(lng).toBe(69.24);
    expect(accuracy).toBe(12);
    // Заряд — процентами: телефон, севший посреди смены, перестанет слать
    // точки, и увидеть это надо до того, как агент пропал.
    expect(battery).toBe(73);
    // Время съёмки: точка, пролежавшая без связи, должна встать на карту туда,
    // где агент был, а не туда, где телефон дозвонился.
    expect(typeof recordedAt).toBe("string");
  });

  it("без разрешения молчит и НЕ спрашивает его", async () => {
    /*
      Системное окно доступа поверх только что отмеченного визита читается как
      сбой: агент нажал «готово», а ему задают вопрос. Согласие берут на
      вкладке «GPS» и при первом запуске — там оно к месту.
    */
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });

    await sendVisitPing();

    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
    expect(mockSaveLocation).not.toHaveBeenCalled();
  });

  it("отказ определения не выходит наружу", async () => {
    // Визит уже отмечен. Упади это исключением — оно всплыло бы в обработчике
    // успеха мутации и превратило бы удачную отметку в красное сообщение.
    mockGetCurrentPositionAsync.mockRejectedValue(new Error("GPS unavailable"));

    await expect(sendVisitPing()).resolves.toBeUndefined();
    expect(mockSaveLocation).not.toHaveBeenCalled();
  });

  it("отказ отправки не выходит наружу", async () => {
    mockSaveLocation.mockRejectedValue(new Error("Network Error"));

    await expect(sendVisitPing()).resolves.toBeUndefined();
  });

  it("недоступный заряд не отменяет точку", async () => {
    // На части устройств уровень заряда не читается вовсе. Точка от этого не
    // становится менее нужной.
    mockGetBatteryLevelAsync.mockRejectedValue(new Error("no battery api"));

    await sendVisitPing();

    expect(mockSaveLocation).toHaveBeenCalledTimes(1);
    expect(mockSaveLocation.mock.calls[0][3]).toBeUndefined();
  });

  it("не ждёт координат дольше десяти секунд", async () => {
    /*
      Агент в подвале магазина ждать не должен: визит отмечен, и «крутилка»
      сверх этого читается как зависшее приложение.
    */
    jest.useFakeTimers();
    mockGetCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const done = sendVisitPing();
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);

    await expect(done).resolves.toBeUndefined();
    expect(mockSaveLocation).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
