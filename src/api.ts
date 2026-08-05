import axios from "axios";
import { SecureStore } from "./storage";

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim())
  ? process.env.EXPO_PUBLIC_API_URL
  : "https://www.warehouse-pro.uz";

/** Append auth token to a URL so <Image source> can fetch protected resources. */
export async function authUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  // S3 / external URLs don't need a token
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  try {
    const token = await SecureStore.getItemAsync("session_token");
    if (!token) return url;
    const full = url.startsWith("/") ? `${API_BASE}${url}` : url;
    return full.includes("?") ? `${full}&token=${token}` : `${full}?token=${token}`;
  } catch {
    return url.startsWith("/") ? `${API_BASE}${url}` : url;
  }
}

const api = axios.create({
  baseURL: `${API_BASE}/api/trpc`,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync("session_token");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
  } catch { /* token not found */ }
  return config;
});

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
    if (status === 401) {
      await SecureStore.deleteItemAsync("session_token").catch(() => {});
      // Clearing the token alone isn't enough — without this, the auth
      // store still thinks the user is logged in (isAuthenticated stays
      // true) until the next manual hydrate(), so the UI silently shows
      // stale screens that fail to load instead of the login screen.
      // Required lazily (not as a top-level import) — auth.ts imports
      // from this file, so a top-level import here would be circular.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAuthStore } = require("./store/auth");
      useAuthStore.setState({ user: null, isAuthenticated: false });
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
    if (jsonPayload === undefined || jsonPayload === null) {
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
  role: "agent" | "operator" | "supervisor" | "ceo" | "merchandiser" | "courier";
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
}

export interface Plan {
  id: number;
  planDate: string;
  status: "planned" | "visited" | "skipped";
  photoUrl?: string;
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
  category?: string;
  unitPrice: string;
  available: string;
  unit?: string;
  photoUrl?: string | null;
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
}

export interface Order {
  id: number;
  orderNumber: string;
  shopName?: string;
  total: string;
  status: "new" | "processing" | "shipped" | "pending" | "delivered" | "cancelled" | "returned" | "partially_returned" | "partial_return_kept";
  createdAt: string;
}

export interface OrderDetail extends Order {
  items: Array<{
    id: number;
    productName: string;
    productCode?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    subtotal: number;
    unit?: string;
    deliveredQuantity?: number | null;
    returnReason?: string | null;
  }>;
  notes?: string;
  discount?: number;
  subtotal: string;
  shop?: { id: number; name: string; address?: string; city?: string; phone?: string; debt?: string; ownerName?: string } | null;
  agent?: { id: number; name: string } | null;
  deliveryResult?: string | null;
  deliveryNotes?: string | null;
}

// ──────────────────────────────────────
// API методы
// ──────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  const res = await axios.post(
    `${API_BASE}/api/login`,
    { email, password },
    {
      timeout: 15_000,
      headers: { "Content-Type": "application/json" }
    }
  );

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

export async function createShop(input: CreateShopInput): Promise<{ id: number }> {
  return trpcMutation<{ id: number }>("agent.createShop", input);
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
  batteryLevel?: number
): Promise<void> {
  await trpcMutation("agent.saveLocation", {
    lat: String(lat),
    lng: String(lng),
    accuracy: accuracy !== undefined ? String(accuracy) : undefined,
    batteryLevel,
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
  id: number; code: string; name: string; unitPrice: string; unit: string; available: string;
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
  return trpcQuery<AgentLocation[]>("agent.getLocations", {});
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

export async function createOrder(input: CreateOrderInput): Promise<{ id: number }> {
  return trpcMutation<{ id: number }>("order.create", input);
}

export async function getMyOrders(): Promise<Order[]> {
  const result = await trpcQuery<{ data: Order[]; total: number }>("order.myOrders");
  return result.data ?? [];
}

export async function getOrderById(id: number): Promise<OrderDetail> {
  return trpcQuery<OrderDetail>("order.getById", { id });
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

export async function updateOrderItems(id: number, items: Array<{ itemId: number; quantity: number }>): Promise<void> {
  return trpcMutation<void>("order.updateItems", { id, items });
}

export async function listAllOrders(params?: { page?: number; pageSize?: number; status?: string; showDeleted?: boolean }): Promise<{ data: Order[]; total: number }> {
  return trpcQuery<{ data: Order[]; total: number }>("order.list", params ?? {});
}

export async function getShop(id: number): Promise<Shop | null> {
  try {
    return await trpcQuery<Shop>("agent.getShopById", { id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("empty json payload")) return null;
    throw e;
  }
}

export async function getShopForSupervisor(id: number): Promise<Shop | null> {
  try {
    return await trpcQuery<Shop>("agent.getShopByIdSupervisor", { id });
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

export async function getBranding(): Promise<TenantBranding> {
  return trpcQuery<TenantBranding>("settings.branding");
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

export async function markOutForDelivery(orderId: number): Promise<void> {
  await trpcMutation("courier.markOutForDelivery", { orderId });
}

export async function markDelivered(orderId: number, cashAmount?: string): Promise<void> {
  await trpcMutation("courier.markDelivered", { orderId, cashAmount });
}

export async function markFailed(orderId: number, reason?: string): Promise<void> {
  await trpcMutation("courier.markFailed", { orderId, reason });
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

export async function completeDelivery(input: CompleteDeliveryInput): Promise<{ success: boolean; result: string; finalStatus: string }> {
  return trpcMutation("courier.completeDelivery", input);
}

// ── Merchandiser / Visit Reports ──────────────────────────────────────────────

export interface VisitReport {
  id: number;
  shopId: number;
  userId: number;
  planId: number;
  photos: string[];
  checklist: Array<{
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
  return trpcMutation<{ success: boolean }>("user.removePushToken", {});
}

// ── Sales targets ─────────────────────────────────────────────────────────────
export interface SalesTarget {
  id: number;
  userId: number;
  userName: string;
  shopId?: number;
  periodType: "daily" | "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  targetAmount: string;
  actualAmount: string;
  notes?: string;
}

export async function getSalesTargets(filters?: { periodType?: string; userId?: number }): Promise<SalesTarget[]> {
  return trpcQuery<SalesTarget[]>("salesTarget.list", filters);
}

export async function getSalesTargetSummary(): Promise<Array<{
  userId: number;
  userName: string;
  targetAmount: string;
  actualAmount: string;
  completion: number;
}>> {
  return trpcQuery("salesTarget.summary");
}

// ── Commissions ───────────────────────────────────────────────────────────────
export interface Commission {
  id: number;
  userId: number;
  userName: string;
  commissionRate: string;
  periodType: "monthly" | "quarterly";
  periodStart: string;
  periodEnd: string;
  salesAmount: string;
  commissionAmount: string;
  status: "pending" | "approved" | "paid";
}

export async function getCommissions(filters?: { periodType?: string; userId?: number; status?: string }): Promise<Commission[]> {
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
  grade: string;
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
  salary?: { base: number; commission: number; bonus: number; total: number };
}

export async function getAgentKpi(period: string): Promise<AgentKpiData> {
  return trpcQuery<AgentKpiData>("kpi.agentKpi", { period });
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

export async function getReturns(filters?: { status?: string; shopId?: number }): Promise<{ data: Return[]; total: number }> {
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

export async function getPriceListById(id: number): Promise<(PriceList & { items: PriceListItem[]; assignments: Array<{ id: number; shopId: number; shopName?: string }> }) | null> {
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
  payment: { paidAmount: string; method: "cash" | "card" | "transfer"; debtDueDate?: string; notes?: string };
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