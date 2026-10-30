import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxRow } from "./drain";

const syncOutboxMock = {
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: { syncOutbox: syncOutboxMock } }));
vi.mock("server-only", () => ({}));

const publishOpsMock = vi.fn();
class SyncHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
vi.mock("./client", () => ({ publishOps: publishOpsMock, SyncHttpError }));

const { drainOutbox, isPermanentFailure, MAX_ATTEMPTS, retryStuckOutbox, sortForPublish, unchangedSince } =
  await import("./drain");

const T0 = new Date("2026-10-30T08:00:00.000Z");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return { id: "row_1", entityType: "product", payload: { op: "delete", id: "prod_1" }, attempts: 0, updatedAt: T0, ...overrides };
}

beforeEach(() => {
  syncOutboxMock.findMany.mockReset();
  syncOutboxMock.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  syncOutboxMock.updateMany.mockReset().mockResolvedValue({ count: 0 });
  syncOutboxMock.count.mockReset().mockResolvedValue(0);
  publishOpsMock.mockReset();
});

describe("sortForPublish", () => {
  it("orders categories before products", () => {
    const product = row({ id: "p", entityType: "product" });
    const category = row({ id: "c", entityType: "category" });

    expect(sortForPublish([product, category]).map((r) => r.id)).toEqual(["c", "p"]);
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

describe("isPermanentFailure", () => {
  it("counts only a 4xx the backend would repeat", () => {
    expect(isPermanentFailure(new SyncHttpError("x", 400))).toBe(true);
    expect(isPermanentFailure(new SyncHttpError("x", 401))).toBe(true);
    expect(isPermanentFailure(new SyncHttpError("x", 422))).toBe(true);
  });

  it("treats no internet, timeouts, 5xx, 408 and 429 as temporary", () => {
    expect(isPermanentFailure(new TypeError("fetch failed"))).toBe(false);
    expect(isPermanentFailure(new DOMException("timed out", "TimeoutError"))).toBe(false);
    expect(isPermanentFailure(new SyncHttpError("x", 500))).toBe(false);
    expect(isPermanentFailure(new SyncHttpError("x", 503))).toBe(false);
    expect(isPermanentFailure(new SyncHttpError("x", 408))).toBe(false);
    expect(isPermanentFailure(new SyncHttpError("x", 429))).toBe(false);
  });
});

describe("drainOutbox", () => {
  it("skips the network call entirely when settings are incomplete", async () => {
    const result = await drainOutbox({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result.skippedNoSettings).toBe(true);
    expect(syncOutboxMock.findMany).not.toHaveBeenCalled();
  });

  it("reads only rows that are not stuck", async () => {
    syncOutboxMock.findMany.mockResolvedValue([]);

    await drainOutbox(settings);

    expect(syncOutboxMock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { attempts: { lt: MAX_ATTEMPTS } } }));
  });

  it("publishes the batch and clears the sent rows on success", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" })]);
    publishOpsMock.mockResolvedValue(undefined);

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 2, stuck: 0, failed: 0, skippedNoSettings: false });
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

  it("on a network failure records the error but leaves attempts alone", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" })]);
    publishOpsMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 0, stuck: 0, failed: 1, skippedNoSettings: false });
    expect(syncOutboxMock.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "a", updatedAt: T0 }] },
      data: { lastError: expect.stringContaining("fetch failed") },
    });
    expect(syncOutboxMock.deleteMany).not.toHaveBeenCalled();
  });

  it("increments attempts on a rejected publish (4xx)", async () => {
    syncOutboxMock.findMany.mockResolvedValue([row({ id: "a" })]);
    publishOpsMock.mockRejectedValue(new SyncHttpError("publish failed: HTTP 400", 400));

    await drainOutbox(settings);

    expect(syncOutboxMock.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "a", updatedAt: T0 }] },
      data: { attempts: { increment: 1 }, lastError: expect.stringContaining("HTTP 400") },
    });
  });

  it("keeps every queued op, deletes included, through a long offline stretch (must 5)", async () => {
    // In-memory outbox: 20 failed passes (20 min of the 60 s poll) with no internet.
    const table = [
      row({ id: "del", payload: { op: "delete", id: "prod_gone" } }),
      row({ id: "cat", entityType: "category", payload: { op: "delete", id: "cat_1" } }),
    ];
    syncOutboxMock.findMany.mockImplementation(async () => table.filter((r) => r.attempts < MAX_ATTEMPTS));
    syncOutboxMock.updateMany.mockImplementation(async ({ data }: { data: { attempts?: { increment: number } } }) => {
      for (const r of table) r.attempts += data.attempts?.increment ?? 0;
      return { count: table.length };
    });
    publishOpsMock.mockRejectedValue(new TypeError("fetch failed"));

    for (let pass = 0; pass < 20; pass++) await drainOutbox(settings);

    expect(syncOutboxMock.deleteMany).not.toHaveBeenCalled();
    expect(table.map((r) => [r.id, r.attempts])).toEqual([
      ["del", 0],
      ["cat", 0],
    ]);

    // Internet is back: the next pass sends both.
    publishOpsMock.mockResolvedValue(undefined);
    const result = await drainOutbox(settings);
    expect(result.sent).toBe(2);
  });

  it("never deletes stuck rows and reports how many there are", async () => {
    syncOutboxMock.findMany.mockResolvedValue([]);
    syncOutboxMock.count.mockResolvedValue(3);

    const result = await drainOutbox(settings);

    expect(result).toEqual({ sent: 0, stuck: 3, failed: 0, skippedNoSettings: false });
    expect(syncOutboxMock.count).toHaveBeenCalledWith({ where: { attempts: { gte: MAX_ATTEMPTS } } });
    expect(syncOutboxMock.deleteMany).not.toHaveBeenCalled();
  });
});

describe("retryStuckOutbox", () => {
  it("resets attempts on stuck rows only", async () => {
    await retryStuckOutbox();

    expect(syncOutboxMock.updateMany).toHaveBeenCalledWith({
      where: { attempts: { gte: MAX_ATTEMPTS } },
      data: { attempts: 0 },
    });
  });
});
