import axios from "axios";
import Constants from "expo-constants";
import { SecureStore } from "./storage";

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim())
  ? process.env.EXPO_PUBLIC_API_URL
  : "https://www.warehouse-pro.uz";

/**
 * Версия сборки — в каждом запросе. По ней сервер считает, сколько телефонов
 * на какой сборке (client_requests_total): до этого «у агента не работает» не
 * привязывалось к версии, и обновились ли все — не знал никто.
 */
export const CLIENT_VERSION = `mobile/${Constants.expoConfig?.version ?? "dev"}`;

const api = axios.create({
  baseURL: `${API_BASE}/api/trpc`,
  timeout: 15_000,
  headers: { "Content-Type": "application/json", "x-client-version": CLIENT_VERSION },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync("session_token");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
  } catch { /* token not found */ }
  return config;
});

/**
 * Отказ, который человек вызвал сам, а не «сессия кончилась».
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Смена пароля с неверным текущим отдаёт 401 (api/user-router.ts бросает
 * UNAUTHORIZED, api/lib/errors.ts переводит его в этот код). Перехватчик
 * реагировал на ЛЮБОЙ 401: стирал токен, обнулял сессию и чистил кэши
 * пользователя.
 *
 * Итог в поле: агент открывает «Профиль», меняет пароль, ошибается в текущем
 * на одну букву — и его выбрасывает на экран входа. Вместе с сессией
 * пропадает незаконченный черновик заказа: clearUserScopedCaches стирает
 * order_draft, recent_shops, cached_products и черновики визитов.
 *
 * Показать «неверный пароль» приложение не успевает: AuthGate уводит на вход
 * раньше, чем обработчик ошибки дорисует сообщение.
 *
 * ── Почему проверка по адресу ───────────────────────────────────────────────
 *
 * Отличить «пароль не подошёл» от «сессия истекла» на стороне клиента больше
 * не по чему: код один и тот же, а текст сообщения зависит от сервера и
 * языка. Адрес процедуры — единственный устойчивый признак, и он уже есть в
 * перехватчике (err.config.url).
 *
 * Список намеренно короткий: сюда попадает только то, где 401 означает
 * «человек ввёл не то», а не «пусти меня обратно».
 */
function isSelfInflicted401(url: unknown): boolean {
  const path = String(url ?? "");
  return path.includes("user.changePassword");
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url;
    const data = err?.response?.data;
    if (__DEV__) console.error(`[tRPC ERROR] ${status} ${url}`, typeof data === "object" ? JSON.stringify(data)?.slice(0, 1000) : data);
    // Extract actual tRPC error message for the caller
    const trpcMsg = data?.error?.json?.message;
    const trpcData = data?.error?.json?.data;
    if (trpcMsg && err instanceof Error) {
      (err as Error & { trpcMessage?: string; trpcData?: unknown }).trpcMessage = trpcMsg;
      (err as Error & { trpcMessage?: string; trpcData?: unknown }).trpcData = trpcData;
    }
    if (status === 401 && !isSelfInflicted401(url)) {
      await SecureStore.deleteItemAsync("session_token").catch(() => {});
      // Фоновый GPS останавливается здесь же, а не только в logout():
      // см. endSessionLocally в store/auth.ts.
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { stopTrackingOnSignOut } = require("./store/auth");
        await stopTrackingOnSignOut?.().catch?.(() => {});
      }
      // Clearing the token alone isn't enough — without this, the auth
      // store still thinks the user is logged in (isAuthenticated stays
      // true) until the next manual hydrate(), so the UI silently shows
      // stale screens that fail to load instead of the login screen.
      // Required lazily (not as a top-level import) — auth.ts imports
      // from this file, so a top-level import here would be circular.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAuthStore, clearUserScopedCaches } = require("./store/auth");
      useAuthStore.setState({ user: null, isAuthenticated: false });
      // Сессия кончилась, а данные предыдущего пользователя оставались на
      // диске: logout() здесь не вызывается, и его очистка не срабатывала.
      // Агент Б входил на том же сменном телефоне, открывал «Новый заказ» и
      // получал «Продолжить черновик?» с магазином, позициями, количествами и
      // скидками клиента агента А — и мог отправить этот заказ от своего
      // имени. Очереди отправки не трогаются: там несделанная работа, она
      // помечена автором и ждёт его возвращения.
      await clearUserScopedCaches?.().catch(() => {});
    }
    return Promise.reject(err);
  }
);

// tRPC v11 response envelope: { result: { data: { json: <payload>, meta: {...} } } }
// Batch mode wraps in array: [{ result: { data: { json: <payload>, meta: {...} } } }]
// Superjson serializes as {json: <data>, meta: {values: {...}}} for each level.
interface TrpcEnvelope {
  result?: { data?: { json?: unknown; meta?: unknown } | unknown; error?: { message?: string; data?: { code?: string; message?: string } } };
}
function unwrap<T>(resData: unknown): T {
  // Handle batch response (array)
  if (Array.isArray(resData) && resData.length > 0) {
    resData = resData[0];
  }

  // Check for tRPC error envelope
  const envelope = resData as TrpcEnvelope | undefined;
  if (envelope?.result && "error" in envelope.result) {
    const err = (envelope.result as { error: { message?: string; data?: { code?: string; message?: string } } }).error;
    const msg = err?.data?.message ?? err?.message ?? "Unknown API error";
    throw new Error(msg);
  }

  // Navigate tRPC + superjson envelope: result.data.json
  const resultData = envelope?.result?.data;
  if (resultData !== undefined && resultData !== null && typeof resultData === "object" && "json" in (resultData as Record<string, unknown>)) {
    const jsonPayload = (resultData as { json: unknown }).json;
    /**
     * null — законный ответ, а не сбой.
     *
     * Раньше здесь бросало исключение на любом null, и это ломало ровно те
     * места, где сервер отвечает «ничего не найдено»: ProductService на
     * ненайденном штрих-коде возвращает null, экран сканера ловил исключение
     * и показывал «Ошибка. Не удалось найти товар». Ветка с честным «Товар не
     * найден» рядом была недостижима: настоящее отсутствие товара показывали
     * как поломку, и агент шёл искать неисправность там, где её нет.
     *
     * Ключ json в ответе есть — значит сервер именно ответил, и ответил
     * пустотой. Отсутствие самого ключа разобрано ниже, как и было.
     */
    if (jsonPayload === undefined) {
      throw new Error("Unexpected API response: empty json payload");
    }
    return jsonPayload as T;
  }

  // Fallback: result.data is the payload directly (non-superjson)
  if (resultData !== undefined && resultData !== null) {
    return resultData as T;
  }

  // Last fallback: the raw response is the payload
  if (resData === undefined || resData === null) {
    throw new Error("Unexpected API response: empty data");
  }
  return resData as T;
}

async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  // tRPC v11 non-batch format: GET /{procedure}?input={"json": ...}
  if (input !== undefined) {
    const encoded = encodeURIComponent(JSON.stringify({ json: input }));
    if (__DEV__) console.log(`[tRPC GET] ${procedure}`, input);
    const res = await api.get(`/${procedure}?input=${encoded}`);
    if (__DEV__) console.log(`[tRPC GET ${procedure}] status=${res.status}`, JSON.stringify(res.data)?.slice(0, 300));
    return unwrap<T>(res.data);
  }
  if (__DEV__) console.log(`[tRPC GET] ${procedure} (no input)`);
  const res = await api.get(`/${procedure}`);
  if (__DEV__) console.log(`[tRPC GET ${procedure}] status=${res.status}`, JSON.stringify(res.data)?.slice(0, 300));
  return unwrap<T>(res.data);
}

async function trpcMutation<T>(
  procedure: string,
  input: unknown,
  opts?: { timeout?: number }
): Promise<T> {
  // tRPC v11 non-batch format: body is {"json": input}
  if (__DEV__) console.log(`[tRPC POST] ${procedure}`, input);
  try {
    const res = await api.post(`/${procedure}`, { json: input }, opts);
    if (__DEV__) console.log(`[tRPC POST ${procedure}] status=${res.status}`, JSON.stringify(res.data)?.slice(0, 300));
    return unwrap<T>(res.data);
  } catch (err: unknown) {
    const e = err as Error & { trpcMessage?: string; response?: unknown };
    if (e.trpcMessage) {
      // Swap in the human-readable tRPC message, but mark that this came back
      // as a tRPC error envelope — meaning the server received the request and
      // deliberately refused it. The offline queue needs that distinction and
      // can't get it from the HTTP status: most of the API rejects with a plain
      // `throw new Error(...)`, which tRPC maps to 500, so status alone makes
      // "этот магазин удалён" indistinguishable from a server restart.
      const wrapped = new Error(e.trpcMessage) as Error & {
        response?: unknown;
        serverRejected?: boolean;
      };
      wrapped.response = e.response;
      wrapped.serverRejected = true;
      throw wrapped;
    }
    throw err;
  }
}

// ──────────────────────────────────────
// Типы
// ──────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
  role: "agent" | "operator" | "supervisor" | "ceo" | "merchandiser" | "courier" | "superadmin";
  tenant: { id: number; name: string; slug: string };
}

export interface Shop {
  id: number;
  name: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  debt?: string;
  status?: string;
  photoUrl?: string;
  notes?: string;
  gpsLat?: string;
  gpsLng?: string;
  territoryId?: number | null;
  territoryName?: string | null;
}

export interface CreateShopInput {
  name: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  photoUrl?: string;
  gpsLat?: string;
  gpsLng?: string;
  territoryId?: number;
  notes?: string;
  /**
   * Метка попытки. Одна и та же для всех повторов одного магазина.
   *
   * Сервер по ней узнаёт повтор и возвращает уже созданный магазин вместо
   * второго. Генерировать её нужно один раз на экран, а не на запрос — иначе
   * повтор придёт с новым ключом и создаст дубликат, ровно как раньше.
   */
  idempotencyKey?: string;
}

export interface Plan {
  id: number;
  planDate: string;
  status: "planned" | "visited" | "skipped";
  photoUrl?: string;
  /*
    Когда визит отметили.

    Строка маршрута показывает время рядом со снимком: «Посещён · 11:42».
    Без него в списке видно только, что визит закрыт, — а супервайзеру важно,
    в котором часу, чтобы сверить с порядком точек.
  */
  visitedAt?: string | null;
  notes?: string;
  shopId?: number;
  shopName?: string;
  shopAddress?: string;
  shopDebt?: string;
  shopCity?: string;
  agentName?: string;
  agentId?: number;
}

export interface AgentKpis {
  todayOrders: number;
  todayRevenue: number;
  assignedShops: number;
}

export interface SupervisorKpis {
  todayOrders: number;
  todayRevenue: number;
  activeAgents: number;
  onlineAgents: number;
  pendingPlans: number;
}

// Premium dashboard types (matching web Dashboard.tsx)
export interface DashboardKpis {
  todayOrders: number;
  todayRevenue: number;
  activeAgents: number;
  totalStock: number;
  customerDebt: number;
  grossMargin: number;
}

export interface TrendPoint {
  date: string;
  orderCount: number;
  revenue: string;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface ActivityOrder {
  id: number;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  shopName: string | null;
  agentName: string | null;
}

export interface SmartAlert {
  severity: "info" | "warning" | "danger";
  title: string;
  message: string;
}

export interface Product {
  id: number;
  name: string;
  code?: string;
  /** Штрих-код поставщика — по нему сканер в корзине находит товар без сети. */
  barcode?: string | null;
  category?: string;
  unitPrice: string;
  available: string | null;
  unit?: string;
  photoUrl?: string | null;
  /** Ниже — то, что product.listAll отдаёт для карточки товара; DECIMAL приходит строкой. */
  packSize?: string | number | null;
  packLabel?: string | null;
  unitWeight?: string | number | null;
  description?: string | null;
}

export interface OrderItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreateOrderInput {
  shopId: number;
  items: OrderItem[];
  notes?: string;
  discount?: number;
  paymentMethod?: "cash" | "card" | "transfer" | "debt";
  idempotencyKey?: string;
  /*
    Когда обещали привезти — ISO с поясом.

    Ставит агент, стоя в магазине: это он говорит срок вслух. Не назвал —
    поля нет, и это законно: «не обещали» и «обещали на сегодня» разные
    вещи, а подставленный срок был бы его обещанием, которого он не давал.
  */
  promisedDeliveryAt?: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  shopName?: string;
  total: string;
  status: "new" | "processing" | "shipped" | "pending" | "delivered" | "cancelled" | "returned";
  createdAt: string;
}

export interface OrderDetail extends Order {
  items: Array<{
    id: number;
    /*
      Товар позиции. Сервер его отдавал всегда (services/order.ts: getById), а
      в типе его не было — и добавить строку в заказ с телефона было нечем:
      сервер различает правку позиции (itemId) и вставку новой (productId).
    */
    productId: number;
    productName: string;
    productCode?: string;
    /** Decimal-колонки приходят строками («2.00»), как и total у заказа. */
    quantity: string;
    unitPrice: string;
    subtotal: string;
    unit?: string;
    deliveredQuantity?: string | null;
    returnReason?: string | null;
  }>;
  notes?: string;
  /** Сумма скидки деньгами, строкой — как и total; процент считается на экране. */
  discount?: string;
  subtotal: string;
  shop?: { id: number; name: string; address?: string; city?: string; phone?: string; debt?: string; ownerName?: string } | null;
  agent?: { id: number; name: string } | null;
  deliveryResult?: string | null;
  deliveryNotes?: string | null;
  /** Обещанный срок или null, если срок магазину не называли. */
  promisedDeliveryAt?: string | null;
  /** Когда довезли — чтобы отличить «вовремя» от «позже обещанного». */
  deliveredAt?: string | null;
}

// ──────────────────────────────────────
// API методы
// ──────────────────────────────────────

/**
 * Один адрес заведён в нескольких организациях, и пароль подошёл сразу к
 * нескольким. Сервер не выбирает за человека — данные в этих организациях
 * разные — а называет их и ждёт повторного запроса с tenantId.
 */
/** Пароль подошёл, но у человека включён второй фактор: нужен код из приложения. */
export class TotpCodeRequired extends Error {
  constructor(message: string) { super(message); this.name = "TotpCodeRequired"; }
}

export class TenantChoiceRequired extends Error {
  readonly organizations: Array<{ tenantId: number; name: string }>;
  constructor(message: string, organizations: Array<{ tenantId: number; name: string }>) {
    super(message);
    this.name = "TenantChoiceRequired";
    this.organizations = organizations;
  }
}

export async function login(
  email: string,
  password: string,
  tenantId?: number,
  code?: string,
): Promise<{ user: User; token: string }> {
  let res;
  try {
    res = await axios.post(
      `${API_BASE}/api/login`,
      { email, password, ...(tenantId === undefined ? {} : { tenantId }), ...(code ? { code } : {}) },
      {
        timeout: 15_000,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (e) {
    const response = axios.isAxiosError(e) ? e.response : undefined;
    const data = response?.data as { code?: string; error?: string; organizations?: Array<{ tenantId: number; name: string }> } | undefined;
    if (response?.status === 409 && data?.code === "TENANT_REQUIRED") {
      throw new TenantChoiceRequired(
        data.error ?? "Выберите организацию",
        data.organizations ?? [],
      );
    }
    if (response?.status === 401 && data?.code === "TOTP_REQUIRED") {
      throw new TotpCodeRequired(data.error ?? "Введите код из приложения");
    }
    throw e;
  }

  const payload = res.data as { token: string; user: User; success: boolean };

  if (payload?.token) {
    await SecureStore.setItemAsync("session_token", payload.token);
  }

  return payload;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync("session_token").catch(() => {});
}

interface MeResponse extends Omit<User, "tenant"> {
  tenantId?: number;
  tenant?: { id?: number; name?: string; slug?: string };
}

export async function getMe(): Promise<User> {
  const res = await trpcQuery<MeResponse>("auth.me");
  // auth.me returns the full user object from ctx.user
  // It may have tenantId (flat) or tenant (nested) depending on Drizzle serialization
  const tenantId = res.tenantId ?? res.tenant?.id;
  const tenantName = res.tenant?.name ?? "";
  const tenantSlug = res.tenant?.slug ?? "";
  return {
    id: res.id,
    name: res.name,
    email: res.email,
    avatar: res.avatar,
    role: res.role as User["role"],
    tenant: { id: tenantId ?? 0, name: tenantName, slug: tenantSlug },
  };
}

export async function getMyShops(): Promise<Shop[]> {
  return trpcQuery<Shop[]>("agent.myShops");
}

export async function getAvailableShops(): Promise<Shop[]> {
  return trpcQuery<Shop[]>("agent.availableShops");
}

export async function getAllShopsForSupervisor(): Promise<Shop[]> {
  return trpcQuery<Shop[]>("agent.listAllShops");
}

/**
 * Своё время ожидания, а не общие 15 секунд.
 *
 * Когда S3 не настроен, фотография магазина едет прямо в теле этого запроса
 * base64-строкой в сотни килобайт — столько же, сколько занимает загрузка
 * снимка, для которой рядом стоит 120 секунд с пометкой «на сельском 3G это
 * минута и больше». Под общим лимитом запрос обрывался раньше, чем сервер
 * успевал ответить, хотя магазин уже был создан: агент видел ошибку и нажимал
 * «Создать» второй раз. Ключ идемпотентности делает такой повтор безвредным,
 * но лишний обрыв всё равно незачем.
 */
const SHOP_CREATE_TIMEOUT_MS = 120_000;

export async function createShop(input: CreateShopInput): Promise<{ id: number; idempotent?: boolean }> {
  return trpcMutation<{ id: number; idempotent?: boolean }>("agent.createShop", input, { timeout: SHOP_CREATE_TIMEOUT_MS });
}

export async function getPlans(agentId?: number, date?: string): Promise<Plan[]> {
  return trpcQuery<Plan[]>("agent.getPlans", { agentId, date });
}

export async function updatePlanStatus(
  planId: number,
  status: Plan["status"]
): Promise<void> {
  await trpcMutation("agent.updatePlanStatus", { planId, status });
}

export async function saveLocation(
  lat: number,
  lng: number,
  accuracy?: number,
  batteryLevel?: number,
  /**
   * Когда точка снята. Передаётся у точек из буфера — тех, что ждали связи.
   *
   * Без него сервер ставил время получения, и на карте супервайзера агент весь
   * день «стоял» на месте последней связи, а вечером мгновенно проезжал
   * маршрут. Проверку геозоны это не ослабляет: сервер по-прежнему считает по
   * времени получения, а это значение служит для показа.
   */
  recordedAt?: string,
  /**
   * Система пометила координаты как подменённые (Android: приложение
   * «фиктивное местоположение»). Единственный признак фрода, который не
   * бывает случайным, — сервер считает по нему; отсутствие GPS фродом
   * не считается.
   */
  mocked?: boolean,
): Promise<void> {
  await trpcMutation("agent.saveLocation", {
    lat: String(lat),
    lng: String(lng),
    accuracy: accuracy !== undefined ? String(accuracy) : undefined,
    batteryLevel,
    recordedAt,
    mocked: mocked === true ? true : undefined,
  });
}

// ── Visit Photo Proof ────────────────────────────────────────────────────────
export async function saveVisitPhoto(
  planId: number,
  photoUrl: string,
  notes?: string
): Promise<void> {
  await trpcMutation("agent.saveVisitPhoto", { planId, photoUrl, notes });
}

// ── Barcode Lookup ───────────────────────────────────────────────────────────
export async function findByBarcode(barcode: string): Promise<{
  id: number; code: string; name: string; unitPrice: string; unit: string; available: string | null;
} | null> {
  return trpcQuery("product.findByBarcode", { barcode });
}

// ── Supervisor: agent location tracking ──────────────────────────────────────
export interface AgentLocation {
  id: number;
  agentId: number;
  agentName?: string;
  lat: string;
  lng: string;
  accuracy?: string;
  batteryLevel?: number;
  createdAt: string;
}

export async function getAgentLocations(): Promise<AgentLocation[]> {
  return trpcQuery<AgentLocation[]>("agent.getLocations");
}

// ── Supervisor: create a visit plan for an agent ─────────────────────────────
export async function createPlan(input: {
  agentId: number;
  shopId: number;
  planDate: string;
  notes?: string;
}): Promise<{ id: number }> {
  return trpcMutation<{ id: number }>("agent.createPlan", input);
}

/**
 * Assign a whole territory in one call.
 *
 * The plan screen used to loop createPlan, one request per shop. A district of
 * forty shops meant forty mutations back to back: the first already-planned
 * shop threw and aborted the loop halfway, and the burst ate the mutation
 * budget so the next territory of the shift would not go through at all.
 *
 * Already-planned shops come back as `skipped` rather than as an error —
 * assigning a territory where some points are already scheduled is a normal
 * thing to do, not a mistake to report.
 */
export async function createPlans(input: {
  agentId: number;
  shopIds: number[];
  planDate: string;
  notes?: string;
}): Promise<{ created: number; skipped: number; notFound: number }> {
  return trpcMutation<{ created: number; skipped: number; notFound: number }>("agent.createPlans", input);
}

// ── Supervisor: list agents (for the "assign plan" picker) ──────────────────
export interface AgentSummary {
  id: number;
  name: string;
}

export async function getAgentsList(): Promise<AgentSummary[]> {
  return trpcQuery<AgentSummary[]>("agent.listAgents");
}

// ── Supervisor: list all shops in the tenant (for the "assign plan" picker) ──
export interface ShopSummary {
  id: number;
  name: string;
  city?: string;
  district?: string;
}

export async function getAllShops(): Promise<ShopSummary[]> {
  return trpcQuery<ShopSummary[]>("agent.listShopsForPlan");
}

export async function getAgentDashboard(): Promise<AgentKpis> {
  return trpcQuery<AgentKpis>("dashboard.agentDashboard");
}

export async function getSupervisorDashboard(): Promise<SupervisorKpis> {
  return trpcQuery<SupervisorKpis>("dashboard.supervisorDashboard");
}

export async function getRevenueTrend(days: number = 7): Promise<number[]> {
  return trpcQuery<number[]>("dashboard.revenueTrend", { days });
}

// Premium dashboard APIs
export async function getDashboardKpis(): Promise<DashboardKpis> {
  return trpcQuery<DashboardKpis>("dashboard.kpis");
}

export async function getDashboardTrends(range: "7d" | "30d" | "month" = "7d"): Promise<TrendPoint[]> {
  return trpcQuery<TrendPoint[]>("dashboard.trends", { range });
}

export async function getDashboardStatusBreakdown(): Promise<StatusBreakdown[]> {
  return trpcQuery<StatusBreakdown[]>("dashboard.statusBreakdown");
}

export async function getDashboardActivity(): Promise<ActivityOrder[]> {
  return trpcQuery<ActivityOrder[]>("dashboard.activity");
}

export async function getSmartAlerts(): Promise<SmartAlert[]> {
  return trpcQuery<SmartAlert[]>("notification.smartAlerts");
}

/* ── Уведомления ───────────────────────────────────────────────────────────
   Толчок на телефон — это только сигнал: пропустил его, и узнать было
   неоткуда. Список отвечает на «что мне приходило», а сервер и так хранит
   прочитанное месяц, непрочитанное три.
   ────────────────────────────────────────────────────────────────────────── */
export type NotificationType = "order" | "payment" | "stock" | "system";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string | null;
  isRead: boolean;
  /** Куда вело уведомление в вебе — на телефоне разбирается отдельно. */
  link: string | null;
  createdAt: string;
}

export async function getNotifications(opts?: { unreadOnly?: boolean; cursor?: number; limit?: number }): Promise<{ items: AppNotification[]; hasMore: boolean }> {
  return trpcQuery<{ items: AppNotification[]; hasMore: boolean }>("notification.list", {
    unreadOnly: opts?.unreadOnly,
    cursor: opts?.cursor,
    limit: opts?.limit ?? 30,
  });
}

export async function getNotificationCounts(): Promise<{ unread: number; byType: Record<NotificationType, number> }> {
  return trpcQuery<{ unread: number; byType: Record<NotificationType, number> }>("notification.counts");
}

export async function markNotificationRead(id: number): Promise<unknown> {
  return trpcMutation("notification.markRead", { id });
}

export async function markAllNotificationsRead(): Promise<unknown> {
  return trpcMutation("notification.markAllRead", undefined);
}

/* ── Показатели курьера ────────────────────────────────────────────────────
   Своё, а не чужое: без courierId сервер считает вошедшего.
   ────────────────────────────────────────────────────────────────────────── */
export interface CourierStats {
  courierId: number;
  courierName: string;
  /** Довезённые заказы — за них и платят. */
  delivered: number;
  /** Сорванные: магазин закрыт, отказ, не дозвонились. */
  failed: number;
  /** Довезены, но товар вернулся — полностью или частью. */
  returned: number;
  deliveredAmount: number;
  /** Наличные, привезённые в кассу. */
  cashCollected: number;
  /** В скольких РАЗНЫХ днях периода он что-то довёз. */
  workDays: number;
  /** Доля довезённого от назначенного. Ноль назначенных — мерить нечего. */
  successRate: number;
}

export async function getCourierKpi(period: "week" | "month" | "quarter" = "month"): Promise<CourierStats> {
  return trpcQuery<CourierStats>("kpi.courierKpi", { period });
}

/* ── Долги по моим заказам ─────────────────────────────────────────────────
   Кому идти собирать. Считается по заказам агента, за вычетом уже внесённых
   платежей; заказы без остатка сюда не попадают.
   ────────────────────────────────────────────────────────────────────────── */
export interface MyDebt {
  orderId: number;
  orderNumber: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  shopId: number;
  shopName: string;
  shopPhone: string | null;
  shopAddress: string | null;
  total: string;
  paid: string;
  remaining: string;
}

export async function getMyDebts(): Promise<MyDebt[]> {
  return trpcQuery<MyDebt[]>("agent.myDebts");
}

/* ── Долги магазинов целиком: для супервайзера ──────────────────────────────
   Не «сколько должны», а «сколько и КАК ДАВНО»: миллион недельного долга и
   миллион полугодового — это две разные организации, и решение, к кому ехать,
   принимается именно из различия. Возраст считается по неоплаченным заказам.
   ────────────────────────────────────────────────────────────────────────── */

/** Границы возраста: неделя — обычная отсрочка, месяц — пора ехать, два — трудные деньги. */
export type AgeBucket = "d0_7" | "d8_30" | "d31_60" | "d60plus";

export interface ShopAging {
  shopId: number;
  shopName: string;
  /** Телефон магазина: долг закрывается звонком, и номер нужен в той же строке. */
  phone: string | null;
  /** Агент, за которым числится магазин, — на чьём маршруте висит долг. */
  agentName: string | null;
  debt: number;
  buckets: Record<AgeBucket, number>;
  /** Долг без привязки к заказу: ручные начисления. Состарить его нечем. */
  unattributed: number;
  /** Возраст самого старого неоплаченного заказа, дней. */
  oldestDays: number | null;
}

export interface ReceivablesAging {
  totalDebt: number;
  buckets: Record<AgeBucket, number>;
  unattributed: number;
  debtorCount: number;
  shops: ShopAging[];
}

export async function getReceivablesAging(): Promise<ReceivablesAging> {
  return trpcQuery<ReceivablesAging>("shop.receivablesAging");
}

/* ── Переписка по заказу ───────────────────────────────────────────────────
   Часть заказа: сервер не даёт ни читать, ни писать в чужой.
   ────────────────────────────────────────────────────────────────────────── */
export interface OrderComment {
  id: number;
  orderId: number;
  userId: number;
  content: string;
  parentId: number | null;
  createdAt: string;
  userName: string | null;
  userAvatar: string | null;
  /** Ответы на этот комментарий — сервер уже собрал их деревом. */
  replies?: OrderComment[];
}

export async function getOrderComments(orderId: number): Promise<OrderComment[]> {
  return trpcQuery<OrderComment[]>("order.listComments", { orderId });
}

export async function addOrderComment(orderId: number, content: string, parentId?: number): Promise<{ id: number }> {
  return trpcMutation("order.addComment", { orderId, content, parentId });
}

export async function getProducts(search?: string): Promise<Product[]> {
  const res = await trpcQuery<Product[] | { data: Product[] }>("product.listAll", search ? { search } : undefined);
  return Array.isArray(res) ? res : (res as { data?: Product[] })?.data ?? [];
}

export async function getCategories(): Promise<string[]> {
  return trpcQuery<string[]>("product.categories");
}

export interface Territory {
  id: number;
  name: string;
  color?: string | null;
  shopCount?: number;
}

export async function getTerritories(): Promise<Territory[]> {
  return trpcQuery<Territory[]>("territory.list");
}

export async function getMyWorkZones(): Promise<Territory[]> {
  return trpcQuery<Territory[]>("agent.myWorkZones");
}

/**
 * Заказ отправляется дольше, чем обычный запрос.
 *
 * Общие 15 секунд рассчитаны на короткий JSON. Заказ на два десятка позиций
 * сервер проводит в одной транзакции — резервирует остаток по каждой строке,
 * считает цены и скидки, пишет движения склада, — и на сельском 3G ответа
 * можно ждать заметно дольше. Обрыв по таймауту здесь особенно неприятен: сам
 * заказ на сервере уже создан, а агент видит ошибку, и запись уходит в
 * очередь. Повтор безвреден — ключ идемпотентности тот же, сервер вернёт
 * существующий заказ, — но агент успевает решить, что заказ не прошёл, и
 * начинает звонить в офис.
 *
 * Столько же, сколько у создания магазина и загрузки фотографии, и по той же
 * причине.
 */
const ORDER_CREATE_TIMEOUT_MS = 120_000;

export async function createOrder(input: CreateOrderInput): Promise<{ id: number; orderNumber?: string; total?: number; held?: boolean }> {
  // total нужен, чтобы сверить сумму, которую агент назвал владельцу, с той,
  // что сервер посчитал по своим ценам на момент отправки.
  // held — заказ ждёт подтверждения офиса (скидка выше порога), а не в работе.
  return trpcMutation<{ id: number; orderNumber?: string; total?: number; held?: boolean }>("order.create", input, { timeout: ORDER_CREATE_TIMEOUT_MS });
}

export async function getMyOrders(): Promise<Order[]> {
  const result = await trpcQuery<{ data: Order[]; total: number }>("order.myOrders");
  return result.data ?? [];
}

export async function getOrderById(id: number): Promise<OrderDetail | null> {
  return trpcQuery<OrderDetail | null>("order.getById", { id });
}

export async function cancelOrder(id: number): Promise<void> {
  return trpcMutation<void>("order.cancel", { id });
}

export async function deleteOrder(id: number): Promise<void> {
  return trpcMutation<void>("order.delete", { id });
}

export async function restoreOrder(id: number): Promise<void> {
  return trpcMutation<void>("order.restore", { id });
}

export async function updateOrder(id: number, data: { notes?: string; discount?: string }): Promise<void> {
  return trpcMutation<void>("order.update", { id, ...data });
}

/**
 * Правка состава заказа.
 *
 * Одним списком три действия, как их различает сервер: {itemId, quantity} —
 * изменить количество, {itemId, quantity: 0} — убрать позицию,
 * {productId, quantity, unitPrice} — добавить товар.
 *
 * Кому и когда это можно, решает сервер: свой заказ и пока он не уехал.
 */
export async function updateOrderItems(
  id: number,
  items: Array<{ itemId?: number; productId?: number; quantity: number; unitPrice?: string }>,
): Promise<void> {
  return trpcMutation<void>("order.updateItems", { id, items });
}

/**
 * Перенести обещанный срок доставки.
 *
 * Своя ручка, а не order.update: та открыта только офису и заодно правит
 * скидку со способом оплаты. Здесь ровно одна возможность — та, что нужна
 * агенту, которому магазин звонит: «сегодня не успеваем, привезём в
 * понедельник».
 *
 * null означает снятое обещание, а не «оставить как было»: иначе ошибочно
 * поставленный срок нечем было бы убрать. Сервер откажет по закрытому
 * заказу — переписывать обещание задним числом нельзя.
 */
export async function setPromisedDelivery(orderId: number, promisedDeliveryAt: string | null): Promise<void> {
  return trpcMutation<void>("order.setPromisedDelivery", { orderId, promisedDeliveryAt });
}

export async function listAllOrders(params?: { page?: number; pageSize?: number; status?: Order["status"]; showDeleted?: boolean }): Promise<{ data: Order[]; total: number }> {
  return trpcQuery<{ data: Order[]; total: number }>("order.list", params ?? {});
}

export async function getShop(id: number): Promise<Shop | null> {
  try {
    return await trpcQuery<Shop | null>("agent.getShopById", { id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("empty json payload")) return null;
    throw e;
  }
}

export async function getShopForSupervisor(id: number): Promise<Shop | null> {
  try {
    return await trpcQuery<Shop | null>("agent.getShopByIdSupervisor", { id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("empty json payload")) return null;
    throw e;
  }
}

export async function updateShop(id: number, data: Partial<CreateShopInput>): Promise<void> {
  // photoUrl is uploaded separately via uploadShopPhoto
  const { photoUrl, ...rest } = data;
  void photoUrl;
  await trpcMutation("agent.updateMyShop", { id, ...rest });
}

export async function uploadShopPhoto(shopId: number, dataUrl: string): Promise<void> {
  await trpcMutation("agent.uploadMyShopPhoto", { shopId, dataUrl });
}

/**
 * How long an image upload may take before we give up.
 *
 * The shared 15s default is sized for JSON round-trips of a few kilobytes. A
 * photo goes up as base64 inside that same JSON body — commonly 1.5–3 MB — and
 * on the rural 3G an agent actually has, that is a minute or more. Under the
 * old timeout those uploads could not succeed at all outside a city: the
 * request was cut off mid-flight and the agent was told "Ошибка загрузки".
 */
const UPLOAD_TIMEOUT_MS = 120_000;

/** Roughly what the server's 5,000,000-character limit allows, in bytes. */
export const MAX_UPLOAD_BYTES = 3_500_000;

/** Upload a base64 image to S3 via server. Returns the public URL. */
export async function uploadFile(dataUrl: string, folder: "products" | "shops" | "avatars" | "visits" = "products"): Promise<string> {
  // Check before spending a minute of the agent's connection on a body the
  // server is going to refuse anyway, and say so in terms they can act on.
  const base64Length = dataUrl.length - (dataUrl.indexOf(",") + 1);
  if (base64Length * 0.75 > MAX_UPLOAD_BYTES) {
    throw new Error("Фото слишком большое. Снимите заново или выберите другое.");
  }
  // A dropped upload used to lose the photo outright: the caller caught the
  // error, showed "Ошибка загрузки" and the image was gone — for a merchandiser
  // that is the proof of the visit they just made, and re-taking it means
  // walking back into the shop. Signal on the road comes and goes over seconds,
  // so a couple of spaced retries recover most of these.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 3000));
    try {
      const result = await trpcMutation<{ url: string }>(
        "upload.file",
        { dataUrl, folder },
        { timeout: UPLOAD_TIMEOUT_MS }
      );
      return result.url;
    } catch (e) {
      lastError = e;
      // The server looked at it and said no — too large, wrong format, not
      // signed in. Sending the identical bytes again cannot change that.
      if ((e as { serverRejected?: boolean })?.serverRejected) throw e;
    }
  }
  throw lastError;
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  avatar?: string;
}

export async function updateProfile(input: UpdateProfileInput): Promise<void> {
  await trpcMutation("user.updateMe", input);
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await trpcMutation("user.changePassword", input);
}

export interface TenantBranding {
  companyName: string;
  logoUrl: string | null;
  currency: string;
  currencySymbol: string;
}

/** Оформление арендатора — branding.get. */
export interface TenantBrandingResponse {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor?: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  appName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  loginTitle: string | null;
  loginSubtitle: string | null;
  footerText: string | null;
  mobileTheme: "light" | "dark" | "auto";
}

export async function getTenantBranding(): Promise<TenantBrandingResponse> {
  return trpcQuery<TenantBrandingResponse>("branding.get");
}

/**
 * Денежные настройки организации — settings.brandingAuth.
 *
 * Полный settings.get отдал бы заодно банковский счёт, ИНН и директора —
 * агенту на телефон эти реквизиты незачем.
 */
export interface TenantMoneySettings {
  companyName: string | null;
  logoUrl: string | null;
  currency: string | null;
  currencySymbol: string | null;
  symbolPosition: "before" | "after" | null;
}

export async function getTenantMoneySettings(): Promise<TenantMoneySettings> {
  return trpcQuery<TenantMoneySettings>("settings.brandingAuth");
}

// ── Courier / Deliveries ──────────────────────────────────────────────────────

export interface Delivery {
  id: number;
  orderNumber: string;
  status: string;
  deliveryStatus: string;
  total: string;
  shopName: string | null;
  shopAddress: string | null;
  shopCity: string | null;
  shopGpsLat: string | null;
  shopGpsLng: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export async function listMyDeliveries(): Promise<Delivery[]> {
  return trpcQuery<Delivery[]>("courier.listMyDeliveries");
}

export async function assignCourier(orderId: number, courierId: number): Promise<void> {
  await trpcMutation("courier.assignCourier", { orderId, courierId });
}

/*
  Отметки курьера ждут дольше обычных 15 с — как создание заказа.

  Отметка списывает склад и пишет платёж; сервер за городом отвечает
  медленно, и 15 секунд обрывали запрос, который на сервере уже прошёл.
  Очередь повторяла его — сервер теперь отвечает на повтор «дубль», но
  лучше не обрывать первый.
*/
const DELIVERY_TIMEOUT_MS = 120_000;

export async function markOutForDelivery(orderId: number): Promise<void> {
  await trpcMutation("courier.markOutForDelivery", { orderId }, { timeout: DELIVERY_TIMEOUT_MS });
}

export async function markDelivered(orderId: number, cashAmount?: string): Promise<void> {
  await trpcMutation("courier.markDelivered", { orderId, cashAmount }, { timeout: DELIVERY_TIMEOUT_MS });
}

export async function markFailed(orderId: number, reason?: string): Promise<void> {
  await trpcMutation("courier.markFailed", { orderId, reason }, { timeout: DELIVERY_TIMEOUT_MS });
}

export interface CompleteDeliveryInput {
  orderId: number;
  result: "paid" | "partial_paid" | "returned" | "partial_returned";
  paidAmount?: string;
  paymentMethod?: "cash" | "card" | "transfer";
  debtDueDate?: string;
  returnReason?: string;
  returnedItems?: Array<{ itemId: number; returnedQty: number }>;
  notes?: string;
}

export async function completeDelivery(input: CompleteDeliveryInput): Promise<{ success: boolean; result: string; finalStatus: string; duplicate?: boolean }> {
  return trpcMutation("courier.completeDelivery", input, { timeout: DELIVERY_TIMEOUT_MS });
}

// ── Merchandiser / Visit Reports ──────────────────────────────────────────────

export interface VisitReport {
  id: number;
  shopId: number;
  userId: number;
  planId: number;
  photos?: string[];
  /** null — отчёт без чек-листа (json-колонка); экраны его не читают. */
  checklist: null | Array<{
    productId: number;
    productName: string;
    present: boolean;
    price?: string;
    promoNote?: string;
  }>;
  competitorNotes: string | null;
  createdAt: string;
  userName: string | null;
  shopName: string | null;
}

export interface SubmitReportInput {
  planId: number;
  shopId: number;
  photos: string[];
  checklist: Array<{
    productId: number;
    productName: string;
    present: boolean;
    price?: string;
    promoNote?: string;
  }>;
  competitorNotes?: string;
}

export async function submitVisitReport(input: SubmitReportInput): Promise<{ success: boolean; reportId: number }> {
  return trpcMutation<{ success: boolean; reportId: number }>("merchandiser.submitReport", input);
}

export async function getReportById(id: number): Promise<VisitReport | null> {
  return trpcQuery<VisitReport | null>("merchandiser.getReportById", { id });
}

export async function getReportsByShop(shopId: number, page = 1, pageSize = 25): Promise<{ data: VisitReport[]; total: number }> {
  return trpcQuery("merchandiser.getReportsByShop", { shopId, page, pageSize });
}

// ── Push notifications ────────────────────────────────────────────────────────
export async function registerPushToken(pushToken: string): Promise<{ success: boolean }> {
  return trpcMutation<{ success: boolean }>("user.registerPushToken", { pushToken });
}

export async function removePushToken(): Promise<{ success: boolean }> {
  return trpcMutation<{ success: boolean }>("user.removePushToken", undefined);
}

// ── Sales targets ─────────────────────────────────────────────────────────────
export interface SalesTarget {
  id: number;
  userId: number;
  userName: string | null;
  shopId?: number;
  periodType: "daily" | "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  targetAmount: string;
  actualAmount: string;
  notes?: string;
}

export async function getSalesTargets(filters?: { periodType?: "daily" | "weekly" | "monthly"; userId?: number }): Promise<SalesTarget[]> {
  return trpcQuery<SalesTarget[]>("salesTarget.list", filters);
}

export async function getSalesTargetSummary(): Promise<Array<{
  userId: number;
  userName: string | null;
  targetAmount: string;
  actualAmount: string;
  revenueCompletion: number;
}>> {
  return trpcQuery("salesTarget.summary");
}

// ── Commissions ───────────────────────────────────────────────────────────────
export interface Commission {
  id: number;
  userId: number;
  userName: string | null;
  commissionRate: string;
  periodType: "monthly" | "quarterly";
  periodStart: string;
  periodEnd: string;
  salesAmount: string;
  commissionAmount: string;
  status: "pending" | "approved" | "paid";
}

export async function getCommissions(filters?: { periodType?: "monthly" | "quarterly"; userId?: number; status?: "pending" | "approved" | "paid" }): Promise<Commission[]> {
  return trpcQuery<Commission[]>("commission.list", filters);
}

export async function setCommissionRate(userId: number, commissionRate: number): Promise<{ success: boolean }> {
  return trpcMutation<{ success: boolean }>("commission.setRate", { userId, commissionRate });
}

// ── Quota (my monthly plan) ──────────────────────────────────────────────────
export interface MyQuota {
  revenue: { target: number; actual: number; pct: number };
  orders: { target: number; actual: number; pct: number };
  visits: { target: number; actual: number; pct: number };
  month: string;
  /** Days in the plan's month, and how many of them have passed. */
  daysTotal: number;
  daysElapsed: number;
}

export async function getMyQuota(month?: string): Promise<MyQuota | null> {
  return trpcQuery<MyQuota | null>("salesTarget.myQuota", month ? { month } : undefined);
}

export interface CreateSalesTargetInput {
  userId: number;
  periodType: "monthly";
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  orderCountTarget?: number;
  visitTarget?: number;
  notes?: string;
}

export async function createSalesTarget(input: CreateSalesTargetInput): Promise<{ success: boolean; id: number }> {
  return trpcMutation("salesTarget.upsert", input);
}

export async function bulkCreateSalesTargets(periodStart: string, periodEnd: string, targets: Array<{ userId: number; targetAmount: number; orderCountTarget?: number; visitTarget?: number }>): Promise<{ success: boolean; created: number; updated: number }> {
  return trpcMutation("salesTarget.bulkUpsert", { periodStart, periodEnd, targets });
}

// ── Agent KPI ────────────────────────────────────────────────────────────────
export interface AgentKpiData {
  kpiScore: number;
  kpiGrade: "A" | "B" | "C" | "D" | "F";
  totalPlans: number;
  visitedPlans: number;
  skippedPlans: number;
  visitCompletionRate: number;
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
  returnCount: number;
  returnRate: number;
  assignedShops: number;
  totalDebt: number;
  debtCollectionRate: number;
  targetRevenue: number;
  targetProgress: number;
  salary?: { base: number; commission: number; total: number };
}

export async function getAgentKpi(period: "week" | "month" | "quarter"): Promise<AgentKpiData> {
  return trpcQuery<AgentKpiData>("kpi.agentKpi", { period });
}

/* ── Зарплата ──────────────────────────────────────────────────────────────
   Своя, а не чужая: сервер считает строго по вошедшему (ctx.user.id).
   Открыто и агенту, и курьеру — расчёт у них разный, а ручка одна.
   ────────────────────────────────────────────────────────────────────────── */
export interface MySalary {
  agentName: string;
  /** Подпись периода, «ГГГГ-ММ-ДД — ГГГГ-ММ-ДД» — её рисует сервер. */
  period: string;

  baseSalary: number;
  commissionRate: number;
  salesAmount: number;
  commissionAmount: number;
  /**
   * По скольким проданным товарам процент НЕ общий.
   *
   * Этим объясняется расхождение суммы с простым «продажи × процент»: без
   * пояснения человек читает его как ошибку расчёта.
   */
  productRateCount: number;

  kpiScore: number;

  /** Чем платят курьеру: суммой за довезённую заявку или процентом. */
  courierPayMode: "per_delivery" | "percent";
  deliveryRate: number;
  deliveredCount: number;
  deliveredAmount: number;
  deliveryPay: number;

  /** Обед и дорожные — ставки ЗА ОДИН рабочий день. */
  mealAllowance: number;
  travelAllowance: number;
  /** В скольких днях периода человек выходил возить. */
  workDays: number;
  allowancePay: number;

  totalSalary: number;

  breakdown: {
    base: number;
    commission: number;
    fraudDeduction: number;
    delivery: number;
    allowance: number;
  };
}

export async function getMySalary(period: "week" | "month" | "quarter" = "month"): Promise<MySalary> {
  return trpcQuery<MySalary>("kpi.salary", { period });
}

/** Одна выдача денег на руки. */
export interface MyPayout {
  id: number;
  /** Аванс отличается от выплаты только тем, что выдан до конца периода. */
  kind: "payout" | "advance";
  amount: string;
  paidAt: string;
  note: string | null;
  /**
   * Когда человек сам подтвердил получение.
   *
   * Пусто — не «не получил», а «ещё не подтвердил»: деньги могли отдать в
   * руки, а телефон он откроет вечером.
   */
  confirmedAt: string | null;
}

export async function getMyPayouts(period: "week" | "month" | "quarter" = "month"): Promise<MyPayout[]> {
  return trpcQuery<MyPayout[]>("kpi.myPayouts", { period });
}

export async function confirmPayout(id: number): Promise<{ success: boolean }> {
  return trpcMutation("kpi.confirmPayout", { id });
}

// ── Returns ───────────────────────────────────────────────────────────────────
export interface Return {
  id: number;
  returnNumber: string;
  orderId?: number;
  shopId: number;
  shopName?: string;
  agentId?: number;
  agentName?: string;
  status: "pending" | "approved" | "rejected" | "completed";
  reason: "defect" | "wrong_item" | "expired" | "damaged" | "other";
  notes?: string;
  totalAmount: string;
  createdAt: string;
}

export interface ReturnItem {
  id: number;
  productId: number;
  productName?: string;
  productCode?: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  reason?: string;
  condition?: string;
}

export async function getReturns(filters?: { status?: Return["status"]; shopId?: number }): Promise<{ data: Return[]; total: number }> {
  return trpcQuery("returns.list", filters);
}

export async function getReturnById(id: number): Promise<(Return & { items: ReturnItem[] }) | null> {
  return trpcQuery("returns.getById", { id });
}

export async function createReturn(input: {
  orderId?: number;
  shopId: number;
  reason: "defect" | "wrong_item" | "expired" | "damaged" | "other";
  notes?: string;
  items: Array<{ productId: number; quantity: number; unitPrice: number; reason?: string; condition?: string }>;
}): Promise<{ id: number; returnNumber: string }> {
  return trpcMutation("returns.create", input);
}

export async function getReturnsSummary(): Promise<Array<{ reason: string; count: number; totalAmount: string }>> {
  return trpcQuery("returns.summary");
}

// ── Reorder alerts ────────────────────────────────────────────────────────────
export interface ReorderAlert {
  productId: number;
  productName: string;
  productCode?: string;
  category?: string;
  currentStock: string;
  reorderPoint: string;
  dailyVelocity: string;
  daysUntilStockout: number;
  dynamicReorderPoint: number;
  alertLevel: "ok" | "warning" | "critical";
}

export async function getReorderAlerts(days?: number): Promise<ReorderAlert[]> {
  return trpcQuery<ReorderAlert[]>("warehouseReports.reorderAlerts", { days: days ?? 30 });
}

// ── Price lists ───────────────────────────────────────────────────────────────
export interface PriceList {
  id: number;
  name: string;
  description?: string;
  type: "shop" | "tier" | "volume";
  isActive: boolean;
  priority: number;
  itemCount: number;
  shopCount: number;
  createdAt: string;
}

export interface PriceListItem {
  id: number;
  productId: number;
  productName?: string;
  productCode?: string;
  price: string;
  minQuantity: string;
  unitPrice?: string;
}

export async function getPriceLists(): Promise<PriceList[]> {
  return trpcQuery<PriceList[]>("priceList.list");
}

export async function getPriceListById(id: number): Promise<(Omit<PriceList, "itemCount" | "shopCount"> & { items: PriceListItem[]; assignments: Array<{ id: number; shopId: number; shopName?: string }> }) | null> {
  return trpcQuery("priceList.getById", { id });
}

export async function getPriceForProduct(productId: number, shopId: number, quantity?: number): Promise<{ price: string; source: string }> {
  return trpcQuery("priceList.getPrice", { productId, shopId, quantity: quantity ?? 1 });
}

// ── Route optimization ────────────────────────────────────────────────────────
export interface OptimizedRoute {
  id: number;
  shopId: number;
  shopName?: string;
  shopAddress?: string;
  shopCity?: string;
  shopDebt?: string;
  distance: number;
}

export async function getOptimizedRoute(currentLat: number, currentLng: number, date?: string): Promise<{ plans: OptimizedRoute[]; totalDistance: number; totalStops: number }> {
  return trpcQuery("agent.getOptimizedRoute", { currentLat, currentLng, date });
}

// ── Partial Payment ──────────────────────────────────────────────────────────

export interface RecordPartialPaymentInput {
  orderId: number;
  paidAmount: string;
  method: "cash" | "card" | "transfer";
  debtDueDate?: string;
  notes?: string;
  /** Ключ повтора: делать один раз при открытии окна, слать тот же при каждой попытке (uuidv4 из store/offline). */
  idempotencyKey?: string;
}

export async function recordPartialPayment(input: RecordPartialPaymentInput): Promise<{ success: boolean }> {
  return trpcMutation("order.recordPartialPayment", input);
}

// ── Partial Delivery ─────────────────────────────────────────────────────────

export interface RecordPartialDeliveryInput {
  orderId: number;
  items: Array<{ itemId: number; deliveredQuantity: number; returnReason?: string }>;
  photos?: string[];
}

export async function recordPartialDelivery(input: RecordPartialDeliveryInput): Promise<{ success: boolean }> {
  return trpcMutation("order.recordPartialDelivery", input);
}

// ── Combined Delivery + Payment ──────────────────────────────────────────────

export interface RecordDeliveryAndPaymentInput {
  orderId: number;
  deliveredItems: Array<{ itemId: number; deliveredQuantity: number; returnReason?: string }>;
  payment: { paidAmount: string; method: "cash" | "card" | "transfer"; debtDueDate?: string; notes?: string; idempotencyKey?: string };
  photos?: string[];
}

export async function recordDeliveryAndPayment(input: RecordDeliveryAndPaymentInput): Promise<{ success: boolean }> {
  return trpcMutation("order.recordDeliveryAndPayment", input);
}

// ── Order Adjustments ────────────────────────────────────────────────────────

export interface OrderAdjustment {
  id: number;
  type: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  photos: string[] | null;
  createdAt: string;
  adjustedByName: string | null;
}

export async function getOrderAdjustments(orderId: number): Promise<OrderAdjustment[]> {
  return trpcQuery("order.getAdjustments", { orderId });
}

// ── Order Payments ───────────────────────────────────────────────────────────

export interface OrderPayment {
  id: number;
  amount: string;
  type: string;
  paymentMethod: string | null;
  status: string | null;
  totalOrderAmount: string | null;
  paidAmount: string | null;
  debtAmount: string | null;
  debtDueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
}

export async function getOrderPayments(orderId: number): Promise<OrderPayment[]> {
  return trpcQuery("order.getOrderPayments", { orderId });
}
// ── Касса: наличные на руках, сдачи, PIN ─────────────────────────────────────

/*
  «У меня на руках вот столько, вот я сдал в кассу» — просьба владельца.
  Веб это показывал (MyCashCard), телефон — нет, а деньги носят именно те,
  у кого веба нет. Ручка cash.mine отдаёт ровно то, что нужно человеку:
  сколько сдать, до какого часа, что уже сдано и есть ли долг по недостачам.
*/
export interface MyCashDocument {
  id: number;
  kind: "pko" | "rko";
  number: number;
  amount: string;
  expectedAmount: string | null;
  discrepancy: string | null;
  note: string | null;
  createdAt: string;
}

export interface MyCash {
  onHand: number;
  debt: number;
  todayIn: number;
  todayCount: number;
  limit: number;
  deadline: string;
  documents: MyCashDocument[];
  nonCashTransit: { count: number; total: number };
}

export async function getMyCash(): Promise<MyCash> {
  return trpcQuery("cash.mine");
}

/** PIN кассы — подпись сотрудника под сдачей наличных и под загрузкой машины. */
export async function setCashPin(pin: string): Promise<{ ok: boolean }> {
  return trpcMutation("cash.setPin", { pin });
}

// ── Ван-селлинг: моя машина, продажа с колёс, чек ────────────────────────────

export interface VanStatus {
  enabled: boolean;
  planAllows: boolean;
}

export interface MyVan {
  id: number;
  name: string;
  plate: string | null;
  driverId: number | null;
  driverName: string | null;
  status: string;
  items: number;
  units: number;
  value: number;
  lastLoadAt: string | null;
}

export interface VanStockLine {
  productId: number;
  name: string;
  code: string;
  unit: string;
  unitPrice: number;
  onHand: number;
  available: number;
  sellable: number;
}

export interface VanSaleInput {
  vanId: number;
  shopId: number;
  items: Array<{ productId: number; quantity: string }>;
  paymentMethod: "cash" | "card" | "transfer" | "debt";
  paidAmount?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface VanSaleResult {
  id: number;
  orderNumber: string;
  total: number;
  paid: number;
  idempotent: boolean;
}

export interface VanSaleRow {
  id: number;
  orderNumber: string;
  shopName: string;
  total: string;
  paymentMethod: string;
  deliveredAt: string | null;
  vanName: string;
}

export interface OrderReceipt {
  url: string;
  number: string;
  total: number;
  html: string;
}

export async function getVanStatus(): Promise<VanStatus> {
  return trpcQuery("van.status");
}

/** Водителю приходят только его машины — сервер режет по driverId. */
export async function getMyVans(): Promise<MyVan[]> {
  return trpcQuery("van.list");
}

export async function getVanStock(vanId: number): Promise<VanStockLine[]> {
  return trpcQuery("van.stock", { vanId });
}

export async function vanSale(input: VanSaleInput): Promise<VanSaleResult> {
  return trpcMutation("van.sale", input, { timeout: 30_000 });
}

export async function getVanSales(input: { vanId?: number; from: string; to: string }): Promise<VanSaleRow[]> {
  return trpcQuery("van.sales", input);
}

/** Чек по заказу: HTML 58 мм с QR и подписанная ссылка. */
export async function getOrderReceipt(id: number): Promise<OrderReceipt> {
  return trpcQuery("order.receipt", { id });
}

export interface VanShop {
  id: number;
  name: string;
  ownerName: string | null;
  debt: string;
  address: string | null;
}

/** Магазины для продажи с машины — водителю (курьеру справочник агента закрыт). */
export async function getVanShops(search?: string): Promise<VanShop[]> {
  return trpcQuery("van.shops", search ? { search } : undefined);
}

// ── Возвратная тара ────────────────────────────────────────────────────────
// Тара следует за товаром сама (сервер); водителю на телефоне — одно дело:
// принять пустую тару от магазина на свою машину. Сколько у магазина числится,
// говорит сервер; больше принять нельзя.

export interface TareLine {
  tareTypeId: number;
  name: string;
  qty: number;
  deposit: number;
}

export interface TareHolder {
  id: number;
  name: string;
  van: boolean;
  lines: TareLine[];
  units: number;
  deposit: number;
}

export interface TareOverview {
  warehouses: TareHolder[];
  shops: TareHolder[];
  totals: { atShops: number; depositAtShops: number };
}

export interface ShopTareLine extends TareLine {
  depositPrice: number;
}

export async function getTareStatus(): Promise<{ enabled: boolean; planAllows: boolean }> {
  return trpcQuery("tare.status");
}

export async function getTareOverview(): Promise<TareOverview> {
  return trpcQuery("tare.overview");
}

export async function getShopTare(shopId: number): Promise<ShopTareLine[]> {
  return trpcQuery("tare.shop", { shopId });
}

export async function returnTareFromShop(input: { shopId: number; warehouseId: number; items: Array<{ tareTypeId: number; quantity: number }>; note?: string }): Promise<{ units: number }> {
  return trpcMutation("tare.returnFromShop", input, { timeout: 20_000 });
}
