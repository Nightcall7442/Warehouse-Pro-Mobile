import axios from "axios";
import { SecureStore } from "./storage";

// EXPO_PUBLIC_API_URL must be set at build time (EAS Build secrets / .env
// for local dev). There's no safe default for a production build — a
// silent fallback to a developer's LAN IP would make every API call fail
// with a generic network error, with no indication of why. Failing loudly
// here, once, at import time is much easier to diagnose than that.
if (!process.env.EXPO_PUBLIC_API_URL && !__DEV__) {
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. The app cannot reach the backend without it — set it in your EAS Build environment/secrets before building for production."
  );
}

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.5:3000";

if (!process.env.EXPO_PUBLIC_API_URL && __DEV__) {
  console.warn(
    `⚠️ EXPO_PUBLIC_API_URL not set — falling back to ${API_BASE}. Set it in .env to point at your dev server.`
  );
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
    if (__DEV__) console.error(`[tRPC ERROR] ${status} ${url}`, typeof data === "object" ? JSON.stringify(data)?.slice(0, 500) : data);
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

async function trpcMutation<T>(procedure: string, input: unknown): Promise<T> {
  // tRPC v11 non-batch format: body is {"json": input}
  if (__DEV__) console.log(`[tRPC POST] ${procedure}`, input);
  const res = await api.post(`/${procedure}`, { json: input });
  if (__DEV__) console.log(`[tRPC POST ${procedure}] status=${res.status}`, JSON.stringify(res.data)?.slice(0, 300));
  return unwrap<T>(res.data);
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
  notes?: string;
}

export interface Plan {
  id: number;
  planDate: string;
  status: "planned" | "visited" | "skipped";
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
}

export interface Order {
  id: number;
  orderNumber: string;
  shopName?: string;
  total: string;
  status: "new" | "processing" | "completed" | "cancelled";
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
    total: number;
  }>;
  notes?: string;
  discount?: number;
  subtotal: string;
  agentName?: string;
  address?: string;
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

export async function getMe(): Promise<User> {
  const res = await trpcQuery<User & { tenantId?: number }>('auth.me');
  // auth.me returns the full user object from ctx.user
  // It may have tenantId (flat) or tenant (nested) depending on Drizzle serialization
  const tenantId = res.tenantId ?? (res.tenant as any)?.id;
  const tenantName = (res.tenant as any)?.name ?? "";
  const tenantSlug = (res.tenant as any)?.slug ?? "";
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
  accuracy?: number
): Promise<void> {
  await trpcMutation("agent.saveLocation", {
    lat: String(lat),
    lng: String(lng),
    accuracy: accuracy !== undefined ? String(accuracy) : undefined,
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

export async function getProducts(search?: string): Promise<Product[]> {
  const res = await trpcQuery<{ data: Product[] } | Product[]>("product.list", {
    page: 1,
    pageSize: 200,
    ...(search ? { search } : {}),
  });
  return Array.isArray(res) ? res : res.data;
}

export async function getCategories(): Promise<string[]> {
  return trpcQuery<string[]>("product.categories");
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

export async function listAllOrders(params?: { page?: number; pageSize?: number; status?: string; showDeleted?: boolean }): Promise<{ data: Order[]; total: number }> {
  return trpcQuery<{ data: Order[]; total: number }>("order.list", params ?? {});
}

export async function getShop(id: number): Promise<Shop> {
  return trpcQuery<Shop>("agent.getShopById", { id });
}

export async function getShopForSupervisor(id: number): Promise<Shop> {
  return trpcQuery<Shop>("agent.getShopByIdSupervisor", { id });
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

/** Upload a base64 image to S3 via server. Returns the public URL. */
export async function uploadFile(dataUrl: string, folder: "products" | "shops" | "avatars" | "visits" = "products"): Promise<string> {
  const result = await trpcMutation<{ url: string }>("upload.file", { dataUrl, folder });
  return result.url;
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