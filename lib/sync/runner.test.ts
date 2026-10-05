import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getShopSyncSettingsMock = vi.fn();
vi.mock("./settings", () => ({ getShopSyncSettings: getShopSyncSettingsMock }));

const pushPendingImagesMock = vi.fn();
vi.mock("./image-push", () => ({ pushPendingImages: pushPendingImagesMock }));

const enqueueProductSyncMock = vi.fn();
vi.mock("./outbox", () => ({ enqueueProductSync: enqueueProductSyncMock }));

const drainOutboxMock = vi.fn();
vi.mock("./drain", () => ({ drainOutbox: drainOutboxMock }));

const importPendingOrdersMock = vi.fn();
vi.mock("./orders", () => ({ importPendingOrders: importPendingOrdersMock }));

const { runSyncPass } = await import("./runner");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

beforeEach(() => {
  getShopSyncSettingsMock.mockReset().mockResolvedValue(settings);
  pushPendingImagesMock.mockReset().mockResolvedValue([]);
  enqueueProductSyncMock.mockReset().mockResolvedValue(undefined);
  drainOutboxMock.mockReset().mockResolvedValue({ sent: 0, dropped: 0, failed: 0, skippedNoSettings: false });
  importPendingOrdersMock.mockReset().mockResolvedValue({ imported: 0, skippedNoSettings: false });
});

describe("runSyncPass", () => {
  it("re-queues every product touched by a freshly-uploaded image before draining", async () => {
    pushPendingImagesMock.mockResolvedValue(["prod_1", "prod_2"]);

    await runSyncPass();

    expect(enqueueProductSyncMock).toHaveBeenCalledWith("prod_1");
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("prod_2");
    expect(pushPendingImagesMock.mock.invocationCallOrder[0]).toBeLessThan(drainOutboxMock.mock.invocationCallOrder[0]);
  });

  it("combines the drain and order-import results", async () => {
    drainOutboxMock.mockResolvedValue({ sent: 3, dropped: 1, failed: 0, skippedNoSettings: false });
    importPendingOrdersMock.mockResolvedValue({ imported: 2, skippedNoSettings: false });

    const result = await runSyncPass();

    expect(result).toEqual({ sent: 3, dropped: 1, failed: 0, ordersImported: 2, skippedNoSettings: false });
  });
});
