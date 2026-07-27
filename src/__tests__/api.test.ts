// Warehouse Pro — API client tests

jest.mock("axios", () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  })),
}));

jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

describe("API Configuration", () => {
  it("API_BASE is defined", () => {
    const { API_BASE } = require("../api");
    expect(API_BASE).toBeDefined();
    expect(typeof API_BASE).toBe("string");
  });

  it("API_BASE is a valid URL", () => {
    const { API_BASE } = require("../api");
    expect(API_BASE).toMatch(/^https?:\/\//);
  });
});

describe("API Functions", () => {
  it("exports all required functions", () => {
    const api = require("../api");
    expect(api.login).toBeDefined();
    expect(api.logout).toBeDefined();
    expect(api.getMe).toBeDefined();
    expect(api.getMyShops).toBeDefined();
    expect(api.getProducts).toBeDefined();
    expect(api.getCategories).toBeDefined();
    expect(api.createOrder).toBeDefined();
    expect(api.getAgentDashboard).toBeDefined();
    expect(api.getPlans).toBeDefined();
    expect(api.updatePlanStatus).toBeDefined();
    expect(api.getSalesTargets).toBeDefined();
    expect(api.getCommissions).toBeDefined();
    expect(api.getReturns).toBeDefined();
    expect(api.getPriceLists).toBeDefined();
    expect(api.getReorderAlerts).toBeDefined();
    expect(api.getOptimizedRoute).toBeDefined();
    expect(api.registerPushToken).toBeDefined();
    expect(api.removePushToken).toBeDefined();
  });
});