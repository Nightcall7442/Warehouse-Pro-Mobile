// Warehouse Pro — Auth store tests
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

describe("Auth Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with correct default state", async () => {
    const { useAuthStore } = await import("../store/auth");
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.isAuthenticated).toBe(false);
  });

  it("hydrate sets loading true then false", async () => {
    const { SecureStore } = await import("../storage");
    const { useAuthStore } = await import("../store/auth");

    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(true);

    await state.hydrate();

    const after = useAuthStore.getState();
    expect(after.isLoading).toBe(false);
    expect(after.isAuthenticated).toBe(false);
  });

  it("logout clears user state", async () => {
    const { useAuthStore } = await import("../store/auth");
    const api = await import("../api");

    vi.mocked(api.logout).mockResolvedValue(undefined);

    // Set initial state
    useAuthStore.setState({ user: { id: 1, name: "Test", email: "test@test.com", role: "agent", tenantId: 1 } as any, isAuthenticated: true });

    await useAuthStore.getState().logout();

    const after = useAuthStore.getState();
    expect(after.user).toBeNull();
    expect(after.isAuthenticated).toBe(false);
  });

  it("updateUser patches user object", async () => {
    const { useAuthStore } = await import("../store/auth");

    useAuthStore.setState({ user: { id: 1, name: "Old Name", email: "test@test.com", role: "agent", tenantId: 1 } as any });

    useAuthStore.getState().updateUser({ name: "New Name" });

    const after = useAuthStore.getState();
    expect(after.user?.name).toBe("New Name");
  });
});
