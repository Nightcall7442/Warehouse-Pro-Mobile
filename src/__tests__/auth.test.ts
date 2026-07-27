// Warehouse Pro — Auth store tests

jest.mock("../storage", () => ({
  SecureStore: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

jest.mock("../api", () => ({
  getMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
}));

const { useAuthStore } = require("../store/auth");
const { getMe } = require("../api");

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false });
  jest.clearAllMocks();
});

describe("Auth Store", () => {
  it("initializes with correct default state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.isAuthenticated).toBe(false);
  });

  it("hydrate sets isLoading true then false", async () => {
    const mockUser = { id: 1, name: "Agent", role: "agent" };
    const SecureStore = require("../storage").SecureStore;
    SecureStore.getItemAsync.mockResolvedValue("valid_token");
    getMe.mockResolvedValue(mockUser);

    const p = useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isLoading).toBe(true);
    await p;
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("logout clears user state", async () => {
    useAuthStore.setState({ user: { id: 1, name: "Agent" } as any, isAuthenticated: true });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("updateUser patches user object", () => {
    useAuthStore.setState({ user: { id: 1, name: "Agent" } as any });
    useAuthStore.getState().updateUser({ name: "Updated" } as any);
    expect(useAuthStore.getState().user).toEqual({ id: 1, name: "Updated" });
  });
});