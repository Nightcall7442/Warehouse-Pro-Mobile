// Warehouse Pro — Push notifications tests

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));

jest.mock("../api", () => ({
  registerPushToken: jest.fn(),
  removePushToken: jest.fn(),
}));

const Notifications = require("expo-notifications");
const api = require("../api");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Push Notifications", () => {
  it("registers push token when authenticated", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[xxx]" });
    api.registerPushToken.mockResolvedValue({ success: true });

    const token = "ExponentPushToken[xxx]";
    await api.registerPushToken(token);
    expect(api.registerPushToken).toHaveBeenCalledWith(token);
  });

  it("removes push token on logout", async () => {
    api.removePushToken.mockResolvedValue({ success: true });
    await api.removePushToken();
    expect(api.removePushToken).toHaveBeenCalled();
  });

  it("handles permission denied gracefully", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" });

    const { status } = await Notifications.getPermissionsAsync();
    expect(status).toBe("denied");

    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    expect(newStatus).toBe("denied");
  });
});