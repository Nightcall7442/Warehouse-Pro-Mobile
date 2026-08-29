// Warehouse Pro — поведенческие тесты по находкам аудита «мобилка-экраны».
//
// Каждый тест здесь ловит реальный сбой в поле, а не форму исходника:
// выброшенный буфер GPS, перезагрузку карты под пальцами супервайзера,
// запрос на каждую клавишу, кэш каталога, забитый выдачей поиска, и
// чек-лист, монтирующий сотни строк разом.

// ── Общие моки платформы ────────────────────────────────────────────────────
const mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => true),
}));

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-battery", () => ({
  getBatteryLevelAsync: jest.fn(async () => 0.8),
}));

jest.mock("../api", () => ({
  saveLocation: jest.fn(async () => undefined),
  getProducts: jest.fn(async () => []),
  getCategories: jest.fn(async () => []),
  createOrder: jest.fn(async () => ({ id: 1 })),
  getMyShops: jest.fn(async () => []),
  getAvailableShops: jest.fn(async () => []),
  getAllShopsForSupervisor: jest.fn(async () => []),
  submitVisitReport: jest.fn(async () => ({ id: 1 })),
  updatePlanStatus: jest.fn(async () => undefined),
  uploadFile: jest.fn(async () => "https://example.test/photo.jpg"),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { yandexMapsApiKey: "test-key" } } },
}));

const mockWebViewProps: Record<string, unknown>[] = [];
const mockInjectJavaScript = jest.fn();

jest.mock("react-native-webview", () => {
  const ReactLib = require("react");
  const WebViewMock = ReactLib.forwardRef(function WebViewMock(props: Record<string, unknown>, ref: unknown) {
    ReactLib.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    mockWebViewProps.push(props);
    return ReactLib.createElement("div", { "data-testid": "webview" });
  });
  return { __esModule: true, WebView: WebViewMock };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../store/toast", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("../store/auth", () => ({
  useAuthStore: () => ({ user: { id: 1, role: "agent", tenantId: 1 } }),
}));

jest.mock("../store/offline", () => ({ uuidv4: () => "test-idempotency-key" }));

jest.mock("../components/SecureImage", () => ({ SecureImage: () => null }));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ planId: "5", shopId: "7", shopName: "Магазин у дома" }),
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock("../lib/prepare-photo", () => ({
  preparePhoto: jest.fn(async () => ({ dataUrl: "data:image/jpeg;base64,AAAA" })),
}));

import React from "react";
import { render, act, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type PendingPoint = { lat: number; lng: number; accuracy: number; recordedAt?: string };

const PENDING_KEY = "pending_locations";

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

function seedPending(count: number): void {
  const points: PendingPoint[] = Array.from({ length: count }, (_, i) => ({
    lat: 41.3 + i / 10000,
    lng: 69.2 + i / 10000,
    accuracy: 10,
    recordedAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  }));
  mockStore[PENDING_KEY] = JSON.stringify(points);
}

function readPendingFromStore(): PendingPoint[] {
  return mockStore[PENDING_KEY] ? (JSON.parse(mockStore[PENDING_KEY]) as PendingPoint[]) : [];
}

function osLocations(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    coords: { latitude: 41.4 + i / 10000, longitude: 69.3 + i / 10000, accuracy: 8 },
    timestamp: 1_700_000_900_000 + i * 1000,
  }));
}

// ── 1. Буфер GPS и лимит запросов ───────────────────────────────────────────
describe("backgroundLocation: буфер точек и 429", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let locationTask: (arg: any) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any;
  let realSetTimeout: typeof setTimeout;

  beforeAll(() => {
    const TaskManager = require("expo-task-manager");
    api = require("../api");
    require("../backgroundLocation");
    locationTask = TaskManager.defineTask.mock.calls[0][1];
  });

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    api.saveLocation.mockReset();
    api.saveLocation.mockResolvedValue(undefined);
    // Паузы между отправками в тесте не ждём: проверяем, что и сколько ушло,
    // а не реальную задержку.
    realSetTimeout = global.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setTimeout = ((fn: () => void) => { fn(); return 0; }) as any;
  });

  afterEach(() => {
    global.setTimeout = realSetTimeout;
  });

  it("429 от общего лимита запросов не стирает накопленный маршрут", async () => {
    seedPending(5);
    api.saveLocation.mockRejectedValue(httpError(429));

    await locationTask({ data: { locations: osLocations(1) }, error: null });

    // Пять точек из зоны без связи плюс свежая — всё должно дождаться
    // следующей попытки. Старый код считал 429 отказом «точка плохая» и
    // удалял их одну за другой за секунды.
    const pending = readPendingFromStore();
    expect(pending).toHaveLength(6);
    expect(pending[0].recordedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("408 (таймаут) тоже не считается отказом по существу", async () => {
    seedPending(3);
    api.saveLocation.mockRejectedValue(httpError(408));

    await locationTask({ data: { locations: osLocations(1) }, error: null });

    expect(readPendingFromStore()).toHaveLength(4);
  });

  it("настоящий отказ сервера (400) точку по-прежнему выбрасывает", async () => {
    seedPending(3);
    api.saveLocation.mockRejectedValue(httpError(400));

    await locationTask({ data: { locations: osLocations(1) }, error: null });

    // Координаты, которые сервер признал невалидными, хранить вечно незачем.
    expect(readPendingFromStore()).toHaveLength(0);
  });

  it("буфер отдаётся порциями, а не всеми 200 точками в один залп", async () => {
    seedPending(30);

    await locationTask({ data: { locations: osLocations(1) }, error: null });

    // Одна свежая точка + не больше 20 из буфера за заход.
    expect(api.saveLocation).toHaveBeenCalledTimes(21);
    expect(readPendingFromStore()).toHaveLength(10);
  });

  it("после отказа сервера остаток пачки от системы не добивает лимит", async () => {
    api.saveLocation.mockRejectedValueOnce(httpError(429));

    await locationTask({ data: { locations: osLocations(8) }, error: null });

    // Первая точка получила 429 — остальные семь уходят в буфер без запросов.
    expect(api.saveLocation).toHaveBeenCalledTimes(1);
    expect(readPendingFromStore()).toHaveLength(8);
  });
});

// ── 5. Карта трекинга ───────────────────────────────────────────────────────
describe("YandexMapView: обновление меток без перезагрузки страницы", () => {
  beforeEach(() => {
    mockWebViewProps.length = 0;
    mockInjectJavaScript.mockClear();
  });

  const marker = (id: number, lat: number, lng: number) => ({
    id, lat, lng, label: `Агент ${id}`, color: "#4b6cf6", online: true, batteryLevel: 55,
  });

  it("новые координаты не пересобирают source — карта не перезагружается", () => {
    const YandexMapView = require("../components/YandexMapView").default;

    const first = React.createElement(YandexMapView, {
      markers: [marker(1, 41.31, 69.24), marker(2, 41.32, 69.25)],
      center: { lat: 41.315, lng: 69.245 },
      zoom: 11,
    });
    const { rerender } = render(first);

    const initialSource = mockWebViewProps[0].source;
    expect(initialSource).toBeTruthy();

    // Страница загрузилась — первая выдача уезжает инъекцией.
    act(() => { (mockWebViewProps[0].onLoadEnd as () => void)(); });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain("updateMarkers(");

    // Агент проехал: и markers, и center, и zoom — новые объекты.
    rerender(React.createElement(YandexMapView, {
      markers: [marker(1, 41.35, 69.28), marker(2, 41.32, 69.25)],
      center: { lat: 41.335, lng: 69.265 },
      zoom: 14,
    }));

    const latestSource = mockWebViewProps[mockWebViewProps.length - 1].source;
    // Тот же самый объект source: WebView не получает нового источника и
    // потому не тянет заново api-maps.yandex.ru. Раньше html пересобирался,
    // и приближённый супервайзером квартал отбрасывало к общему виду.
    expect(latestSource).toBe(initialSource);

    // А метки при этом обновились.
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(2);
    expect(mockInjectJavaScript.mock.calls[1][0]).toContain("41.35");
  });

  it("одинаковая выдача не дёргает карту вовсе", () => {
    const YandexMapView = require("../components/YandexMapView").default;

    const markers = [marker(7, 41.31, 69.24)];
    const { rerender } = render(React.createElement(YandexMapView, { markers, zoom: 11 }));
    act(() => { (mockWebViewProps[0].onLoadEnd as () => void)(); });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);

    // Тот же набор меток, но новый массив — опрос идёт каждые несколько секунд.
    rerender(React.createElement(YandexMapView, { markers: [marker(7, 41.31, 69.24)], zoom: 11 }));
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it("страница карты строится без меток и умеет их принимать", () => {
    const YandexMapView = require("../components/YandexMapView").default;
    render(React.createElement(YandexMapView, { markers: [marker(3, 41.31, 69.24)], zoom: 11 }));

    const html = (mockWebViewProps[0].source as { html: string }).html;
    expect(html).toContain("function updateMarkers(");
    // Метка не вшита в разметку страницы — иначе её изменение снова означало бы
    // новый html и перезагрузку.
    expect(html).not.toContain("Агент 3");
  });
});

// ── 3 и 4. Каталог: поиск и офлайн-кэш ──────────────────────────────────────
function withQueryClient(element: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return React.createElement(QueryClientProvider, { client }, element);
}

function product(id: number, name: string) {
  return {
    id, name, code: `SKU-${id}`, unit: "pcs", category: "напитки",
    unitPrice: "12000.00", available: "50.000", reserved: "0.000", photoUrl: null,
  };
}

const FULL_CATALOG = [product(1, "Кока-кола 1л"), product(2, "Вода 0.5л"), product(3, "Сок яблочный")];

describe("catalog: поиск и офлайн-кэш", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any;

  beforeAll(() => {
    api = require("../api");
  });

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    api.getProducts.mockReset();
    api.getProducts.mockImplementation(async (q?: string) =>
      q ? [product(1, "Кока-кола 1л")] : FULL_CATALOG);
    api.getCategories.mockResolvedValue([]);
    api.getAvailableShops.mockResolvedValue([]);
  });

  async function renderCatalog() {
    const CatalogScreen = require("../../app/(tabs)/catalog").default;
    render(withQueryClient(React.createElement(CatalogScreen)));
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockStore["cached_products"]).toBeTruthy());
    return screen.getByPlaceholderText("Поиск товаров...");
  }

  async function type(input: HTMLElement, values: string[]) {
    for (const value of values) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await act(async () => { fireEvent.change(input, { target: { value } } as any); });
    }
  }

  it("сетевой запрос уходит один раз на осевший текст, а не на каждую клавишу", async () => {
    const input = await renderCatalog();

    await type(input, ["к", "ко", "кок", "кока"]);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });

    // Первый вызов — полный каталог, второй — единственный запрос по поиску.
    // Без debounce на «кока» уходило четыре запроса подряд, каждый со своим
    // 15-секундным таймаутом, и ни один не отменялся.
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledTimes(2));
    expect(api.getProducts.mock.calls.map((c: unknown[]) => c[0])).toEqual(["", "кока"]);
  });

  it("офлайн-кэш не затирается выдачей поиска", async () => {
    const input = await renderCatalog();
    expect(JSON.parse(mockStore["cached_products"])).toHaveLength(3);

    await type(input, ["кока"]);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledTimes(2));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

    // Три позиции полного каталога на месте: раньше поверх них ложился ответ
    // поиска, и в подвале магазина «Офлайн данные» показывали один товар.
    expect(JSON.parse(mockStore["cached_products"])).toHaveLength(3);
  });
});

// ── 2. Чек-лист отчёта мерчандайзера ────────────────────────────────────────
describe("merchandiser/visit: чек-лист на большом каталоге", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any;

  beforeAll(() => {
    api = require("../api");
  });

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    api.getProducts.mockReset();
    api.getProducts.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => product(i + 1, `Товар ${i + 1}`)));
  });

  async function renderVisit() {
    const VisitScreen = require("../../app/merchandiser/visit").default;
    render(withQueryClient(React.createElement(VisitScreen)));
    await waitFor(() => expect(screen.getAllByPlaceholderText("Цена").length).toBeGreaterThan(0));
  }

  it("не монтирует все строки каталога разом", async () => {
    await renderVisit();

    // Каталог на 300 SKU — это 600 нативных полей ввода, если рисовать всё
    // сразу: экран отчёта открывался с многосекундной паузой. Список
    // виртуализован, поэтому смонтирована только видимая часть.
    const mounted = screen.getAllByPlaceholderText("Цена").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(100);

    // Переезд со ScrollView на список не должен потерять шапку с фото и
    // заметки о конкурентах — они теперь в ListHeader/ListFooter.
    expect(screen.getByText("Фотографии")).toBeTruthy();
    expect(screen.getByText("Заметки о конкурентах")).toBeTruthy();
    expect(screen.getByPlaceholderText("Что видно на полках конкурентов...")).toBeTruthy();
  });

  it("правка цены остаётся в своей строке", async () => {
    await renderVisit();

    const priceInputs = screen.getAllByPlaceholderText("Цена");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await act(async () => { fireEvent.change(priceInputs[0], { target: { value: "12500" } } as any); });

    expect((screen.getAllByPlaceholderText("Цена")[0] as HTMLInputElement).value).toBe("12500");
    expect((screen.getAllByPlaceholderText("Цена")[1] as HTMLInputElement).value).toBe("");
  });
});
