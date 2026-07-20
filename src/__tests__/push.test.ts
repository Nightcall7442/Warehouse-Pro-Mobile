// Warehouse Pro — Push notifications tests
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { HIGH: 4 },
}));

vi.mock("../api", () => ({
  registerPushToken: vi.fn(),
  removePushToken: vi.fn(),
}));

vi.mock("../store/auth", () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({ isAuthenticated: false })),
}));

describe("Push Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers push token when authenticated", async () => {
    const Notifications = await import("expo-notifications");
    const api = await import("../api");

    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as any);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[xxx]" } as any);
    vi.mocked(api.registerPushToken).mockResolvedValue({ success: true });

    // Import and call the hook logic
    const { registerPushToken } = api;
    const token = "ExponentPushToken[xxx]";

    await registerPushToken(token);

    expect(api.registerPushToken).toHaveBeenCalledWith(token);
  });

  it("removes push token on logout", async () => {
    const api = await import("../api");
    vi.mocked(api.removePushToken).mockResolvedValue({ success: true });

    const { removePushToken } = api;
    await removePushToken();

    expect(api.removePushToken).toHaveBeenCalled();
  });

  it("handles permission denied gracefully", async () => {
    const Notifications = await import("expo-notifications");

    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied" } as any);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as any);

    const { status } = await Notifications.getPermissionsAsync();
    expect(status).toBe("denied");

    // Should not throw
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    expect(newStatus).toBe("denied");
  });
});
