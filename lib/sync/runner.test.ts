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
  drainOutboxMock.mockReset().mockResolvedValue({ sent: 0, stuck:0, failed: 0, skippedNoSettings: false });
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
    drainOutboxMock.mockResolvedValue({ sent: 3, stuck:1, failed: 0, skippedNoSettings: false });
    importPendingOrdersMock.mockResolvedValue({ imported: 2, skippedNoSettings: false });

    const result = await runSyncPass();

    expect(result).toEqual({ sent: 3, stuck:1, failed: 0, ordersImported: 2, skippedNoSettings: false });
  });
});

describe("runSyncPass single-flight (must 6)", () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Rejected before the pass reaches drainOutbox: mark handled so vitest
    // doesn't report it as unhandled; awaiting it later still throws.
    promise.catch(() => undefined);
    return { promise, resolve, reject };
  }

  it("never runs two passes at once and folds triggers during a pass into one follow-up", async () => {
    const first = deferred();
    let running = 0;
    let maxRunning = 0;
    drainOutboxMock.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      if (drainOutboxMock.mock.calls.length === 1) await first.promise;
      running--;
      return { sent: 1, stuck:0, failed: 0, skippedNoSettings: false };
    });

    const a = runSyncPass();
    const b = runSyncPass(); // e.g. a save during the pass
    const c = runSyncPass(); // e.g. the Electron poll during the same pass
    expect(b).toBe(c);
    first.resolve();
    await Promise.all([a, b, c]);

    expect(drainOutboxMock).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });

  it("still runs the follow-up when the running pass fails", async () => {
    const first = deferred();
    drainOutboxMock
      .mockImplementationOnce(async () => {
        await first.promise;
        return { sent: 0, stuck:0, failed: 0, skippedNoSettings: false };
      })
      .mockResolvedValue({ sent: 1, stuck:0, failed: 0, skippedNoSettings: false });

    const a = runSyncPass();
    const b = runSyncPass();
    first.reject(new Error("backend down"));

    await expect(a).rejects.toThrow("backend down");
    await expect(b).resolves.toMatchObject({ sent: 1 });
    expect(drainOutboxMock).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh pass once the previous one has finished", async () => {
    await runSyncPass();
    await runSyncPass();

    expect(drainOutboxMock).toHaveBeenCalledTimes(2);
  });
});
