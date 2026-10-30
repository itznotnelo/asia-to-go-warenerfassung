import { beforeEach, describe, expect, it, vi } from "vitest";

const getShopSyncSettingsMock = vi.fn();
const saveShopSyncSettingsMock = vi.fn();
vi.mock("@/lib/sync/settings", () => ({
  getShopSyncSettings: getShopSyncSettingsMock,
  saveShopSyncSettings: saveShopSyncSettingsMock,
}));
vi.mock("@/lib/sync/outbox", () => ({ countPendingOutbox: vi.fn(), enqueueAllProductsSync: vi.fn() }));
vi.mock("@/lib/sync/drain", () => ({ countStuckOutbox: vi.fn(), retryStuckOutbox: vi.fn() }));
vi.mock("@/lib/sync/runner", () => ({ runSyncPass: vi.fn() }));

const { loadShopSyncSettings, updateShopSyncSettings } = await import("./actions");

const STORED = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "stored-device-key-123" };

beforeEach(() => {
  getShopSyncSettingsMock.mockReset().mockResolvedValue(STORED);
  saveShopSyncSettingsMock.mockReset().mockResolvedValue(undefined);
});

describe("loadShopSyncSettings (review should #38)", () => {
  it("never returns the device key, only whether one is stored", async () => {
    const view = await loadShopSyncSettings();
    expect(view).toEqual({ apiUrl: STORED.apiUrl, deviceId: "shop-pc", hasDeviceKey: true });
    expect(JSON.stringify(view)).not.toContain(STORED.deviceKey);
  });

  it("reports a missing key", async () => {
    getShopSyncSettingsMock.mockResolvedValue({ ...STORED, deviceKey: "" });
    expect((await loadShopSyncSettings()).hasDeviceKey).toBe(false);
  });
});

describe("updateShopSyncSettings", () => {
  it("keeps the stored key when the field is left empty", async () => {
    await expect(updateShopSyncSettings({ apiUrl: STORED.apiUrl, deviceId: "shop-pc-2", deviceKey: "  " })).resolves.toEqual({ ok: true });
    expect(saveShopSyncSettingsMock).toHaveBeenCalledWith({ apiUrl: STORED.apiUrl, deviceId: "shop-pc-2", deviceKey: STORED.deviceKey });
  });

  it("replaces the key when a new one is typed", async () => {
    await updateShopSyncSettings({ apiUrl: STORED.apiUrl, deviceId: "shop-pc", deviceKey: "new-device-key-456" });
    expect(saveShopSyncSettingsMock).toHaveBeenCalledWith({ apiUrl: STORED.apiUrl, deviceId: "shop-pc", deviceKey: "new-device-key-456" });
  });

  it("rejects malformed input without saving", async () => {
    await expect(updateShopSyncSettings({ apiUrl: 1 })).resolves.toEqual({ ok: false, message: "Bitte Eingaben prüfen." });
    expect(saveShopSyncSettingsMock).not.toHaveBeenCalled();
  });
});
