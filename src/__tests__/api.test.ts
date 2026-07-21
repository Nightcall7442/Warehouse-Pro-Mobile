// Warehouse Pro — API client tests
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}));

vi.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
}));

describe("API Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("API_BASE is defined", async () => {
    const api = await import("../api");
    expect(api.API_BASE).toBeDefined();
    expect(typeof api.API_BASE).toBe("string");
  });

  it("API_BASE is a valid URL", async () => {
    const api = await import("../api");
    expect(api.API_BASE).toMatch(/^https?:\/\//);
  });
});

describe("API Functions", () => {
  it("exports all required functions", async () => {
    const api = await import("../api");

    // Auth
    expect(api.login).toBeDefined();
    expect(api.logout).toBeDefined();
    expect(api.getMe).toBeDefined();

    // Data
    expect(api.getMyShops).toBeDefined();
    expect(api.getProducts).toBeDefined();
    expect(api.getCategories).toBeDefined();
    expect(api.createOrder).toBeDefined();

    // Reports
    expect(api.getAgentDashboard).toBeDefined();
    expect(api.getPlans).toBeDefined();
    expect(api.updatePlanStatus).toBeDefined();

    // New features
    expect(api.getSalesTargets).toBeDefined();
    expect(api.getCommissions).toBeDefined();
    expect(api.getReturns).toBeDefined();
    expect(api.getPriceLists).toBeDefined();
    expect(api.getReorderAlerts).toBeDefined();
    expect(api.getOptimizedRoute).toBeDefined();

    // Push
    expect(api.registerPushToken).toBeDefined();
    expect(api.removePushToken).toBeDefined();
  });
});
