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
describe("session survives a lost connection", () => {
  const { SecureStore } = require("../storage");

  beforeEach(() => {
    // The store awaits these, so bare jest.fn() (returning undefined) breaks
    // on `.catch(...)` before the assertion is ever reached.
    SecureStore.setItemAsync.mockResolvedValue(undefined);
    SecureStore.deleteItemAsync.mockResolvedValue(undefined);
  });

  /**
   * Agents work where there is no signal. getMe() throws the same way for a
   * dead connection as for an expired token, and hydrate() used to delete the
   * token on any throw — so opening the app out of coverage logged them out
   * and made them type their password again. That is the "аккаунт каждый раз
   * спрашивает войти" complaint.
   */
  it("keeps the token and the user when the server is unreachable", async () => {
    SecureStore.getItemAsync.mockImplementation(async (key: string) =>
      key === "session_token" ? "tok" :
      key === "cached_user" ? JSON.stringify({ id: 7, name: "Агент", role: "agent" }) : null);
    // No `response` field — axios reports it this way when nothing came back.
    getMe.mockRejectedValue(Object.assign(new Error("Network Error"), { code: "ECONNABORTED" }));

    await useAuthStore.getState().hydrate();

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith("session_token");
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.name).toBe("Агент");
  });

  it("still signs out when the server actually rejects the session", async () => {
    SecureStore.getItemAsync.mockImplementation(async (key: string) =>
      key === "session_token" ? "tok" :
      key === "cached_user" ? JSON.stringify({ id: 7, name: "Агент", role: "agent" }) : null);
    getMe.mockRejectedValue(Object.assign(new Error("Unauthorized"), { response: { status: 401 } }));

    await useAuthStore.getState().hydrate();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("session_token");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
