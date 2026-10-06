import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxRow } from "./drain";

const syncOutboxMock = {
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: { syncOutbox: syncOutboxMock } }));
vi.mock("server-only", () => ({}));

const publishOpsMock = vi.fn();
vi.mock("./client", () => ({ publishOps: publishOpsMock }));

const { drainOutbox, partitionForDrain } = await import("./drain");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return { id: "row_1", entityType: "product", payload: { op: "delete", id: "prod_1" }, attempts: 0, ...overrides };
}

beforeEach(() => {
  syncOutboxMock.findMany.mockReset();
  syncOutboxMock.deleteMany.mockReset().mockResolvedValue({});
  syncOutboxMock.update.mockReset().mockResolvedValue({});
  publishOpsMock.mockReset();
});

describe("partitionForDrain", () => {
  it("drops rows that already failed 8 times, keeps the rest", () => {
    const fresh = row({ id: "fresh", attempts: 0 });
    const exhausted = row({ id: "exhausted", attempts: 8 });

    const { toSend, toDrop } = partitionForDrain([fresh, exhausted]);

    expect(toSend.map((r) => r.id)).toEqual(["fresh"]);
    expect(toDrop.map((r) => r.id)).toEqual(["exhausted"]);
  });

  it("orders categories before products within the send list", () => {
    const product = row({ id: "p", entityType: "product" });
    const category = row({ id: "c", entityType: "category" });

    const { toSend } = partitionForDrain([product, category]);

    expect(toSend.map((r) => r.id)).toEqual(["c", "p"]);
  });
});

describe("drainOutbox", () => {
  it("skips the network call entirely when settings are incomplete", async () => {
    const result = await drainOutbox({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result.skippedNoSettings).toBe(true);
    expect(syncOutboxMock.findMany).not.toHaveBeenCalled();
  });

  it("publishes the batch and clears the outbox on success", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" })]);
    publishOpsMock.mockResolvedValue(undefined);

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 2, dropped: 0, failed: 0, skippedNoSettings: false });
    expect(publishOpsMock).toHaveBeenCalledWith(settings, [row({ id: "a" }).payload, row({ id: "b" }).payload]);
    expect(syncOutboxMock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } });
  });

  it("increments attempts and records the error on a failed publish, without deleting the rows", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" })]);
    publishOpsMock.mockRejectedValue(new Error("network down"));

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 0, dropped: 0, failed: 1, skippedNoSettings: false });
    expect(syncOutboxMock.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { attempts: { increment: 1 }, lastError: expect.stringContaining("network down") },
    });
    expect(syncOutboxMock.deleteMany).not.toHaveBeenCalledWith({ where: { id: { in: ["a"] } } });
  });

  it("drops exhausted rows even when the remaining batch still fails", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "exhausted", attempts: 8 }), row({ id: "fresh" })]);
    publishOpsMock.mockRejectedValue(new Error("boom"));

    const result = await drainOutbox(settings);

    expect(result.dropped).toBe(1);
    expect(result.failed).toBe(1);
    expect(syncOutboxMock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["exhausted"] } } });
  });
});
