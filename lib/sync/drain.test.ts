import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxRow } from "./drain";

const syncOutboxMock = {
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: { syncOutbox: syncOutboxMock } }));
vi.mock("server-only", () => ({}));

const publishOpsMock = vi.fn();
vi.mock("./client", () => ({ publishOps: publishOpsMock }));

const { drainOutbox, partitionForDrain, unchangedSince } = await import("./drain");

const T0 = new Date("2026-10-30T08:00:00.000Z");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return { id: "row_1", entityType: "product", payload: { op: "delete", id: "prod_1" }, attempts: 0, updatedAt: T0, ...overrides };
}

beforeEach(() => {
  syncOutboxMock.findMany.mockReset();
  syncOutboxMock.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  syncOutboxMock.updateMany.mockReset().mockResolvedValue({ count: 0 });
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

describe("unchangedSince", () => {
  it("pins every row to the updatedAt that was read, never matches by id alone", () => {
    const t1 = new Date("2026-10-30T08:00:01.000Z");

    expect(unchangedSince([row({ id: "a" }), row({ id: "b", updatedAt: t1 })])).toEqual({
      OR: [
        { id: "a", updatedAt: T0 },
        { id: "b", updatedAt: t1 },
      ],
    });
  });
});

describe("drainOutbox", () => {
  it("skips the network call entirely when settings are incomplete", async () => {
    const result = await drainOutbox({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result.skippedNoSettings).toBe(true);
    expect(syncOutboxMock.findMany).not.toHaveBeenCalled();
  });

  it("publishes the batch and clears the sent rows on success", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" })]);
    publishOpsMock.mockResolvedValue(undefined);

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 2, dropped: 0, failed: 0, skippedNoSettings: false });
    expect(publishOpsMock).toHaveBeenCalledWith(settings, [row({ id: "a" }).payload, row({ id: "b" }).payload]);
    expect(syncOutboxMock.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "a", updatedAt: T0 }, { id: "b", updatedAt: T0 }] },
    });
  });

  it("keeps a payload re-saved during the publish (must 6: lost update)", async () => {
    // In-memory outbox so the delete's where clause is actually evaluated.
    const table = [row({ id: "a", payload: { op: "delete", id: "v1" } })];
    syncOutboxMock.findMany.mockImplementation(async () => table.map((r) => ({ ...r })));
    syncOutboxMock.deleteMany.mockImplementation(async ({ where }: { where: ReturnType<typeof unchangedSince> }) => {
      const before = table.length;
      for (let i = table.length - 1; i >= 0; i--) {
        if (where.OR.some((w) => w.id === table[i].id && w.updatedAt.getTime() === table[i].updatedAt.getTime())) {
          table.splice(i, 1);
        }
      }
      return { count: before - table.length };
    });
    publishOpsMock.mockImplementation(async () => {
      // The owner corrects the price while v1 is in flight: same row id, new payload + updatedAt.
      table[0] = { ...table[0], payload: { op: "delete", id: "v2" }, updatedAt: new Date(T0.getTime() + 1000) };
    });

    await drainOutbox(settings);

    expect(table).toHaveLength(1);
    expect(table[0].payload).toEqual({ op: "delete", id: "v2" });
  });

  it("increments attempts only on the rows it read, without deleting them", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" })]);
    publishOpsMock.mockRejectedValue(new Error("network down"));

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 0, dropped: 0, failed: 1, skippedNoSettings: false });
    expect(syncOutboxMock.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "a", updatedAt: T0 }] },
      data: { attempts: { increment: 1 }, lastError: expect.stringContaining("network down") },
    });
    expect(syncOutboxMock.deleteMany).not.toHaveBeenCalled();
  });

  it("drops exhausted rows even when the remaining batch still fails", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "exhausted", attempts: 8 }), row({ id: "fresh" })]);
    publishOpsMock.mockRejectedValue(new Error("boom"));

    const result = await drainOutbox(settings);

    expect(result.dropped).toBe(1);
    expect(result.failed).toBe(1);
    expect(syncOutboxMock.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ id: "exhausted", updatedAt: T0 }] } });
  });
});
