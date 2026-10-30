import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const productMock = { updateMany: vi.fn() };
const categoryMock = { findUnique: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { product: productMock, category: categoryMock } }));

const enqueueProductSyncMock = vi.fn();
vi.mock("@/lib/sync/outbox", () => ({ enqueueProductSync: enqueueProductSyncMock }));

const triggerBackgroundDrainMock = vi.fn();
vi.mock("@/lib/sync/runner", () => ({ triggerBackgroundDrain: triggerBackgroundDrainMock }));

const { applyBulkUpdate } = await import("./bulk-update");

beforeEach(() => {
  productMock.updateMany.mockReset().mockResolvedValue({ count: 2 });
  categoryMock.findUnique.mockReset().mockResolvedValue({ slug: "nudeln", parent: { slug: "lebensmittel" } });
  enqueueProductSyncMock.mockReset().mockResolvedValue(undefined);
  triggerBackgroundDrainMock.mockReset();
});

describe("applyBulkUpdate", () => {
  it("queues every product for the shop after a VAT-only change", async () => {
    const result = await applyBulkUpdate({ ids: ["p1", "p2"], vatRate: 8.1 });

    expect(result).toEqual({ ok: true, count: 2 });
    expect(productMock.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "p2"] } }, data: { vatRate: 8.1 } });
    expect(enqueueProductSyncMock.mock.calls).toEqual([["p1"], ["p2"]]);
    expect(triggerBackgroundDrainMock).toHaveBeenCalledOnce();
  });

  it("queues every product after a category-only change", async () => {
    await applyBulkUpdate({ ids: ["p1", "p2"], categoryId: "cat-noodles" });
    expect(enqueueProductSyncMock).toHaveBeenCalledTimes(2);
    expect(triggerBackgroundDrainMock).toHaveBeenCalledOnce();
  });

  it("rejects a VAT rate outside 2.6/8.1 without touching the DB", async () => {
    const result = await applyBulkUpdate({ ids: ["p1"], vatRate: 7.7 });
    expect(result).toEqual({ ok: false, message: "MwSt muss 2.6 % oder 8.1 % sein" });
    expect(productMock.updateMany).not.toHaveBeenCalled();
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing category", null],
    ["a top-level heading", { slug: "lebensmittel", parent: null }],
  ])("rejects %s", async (_label, category) => {
    categoryMock.findUnique.mockResolvedValue(category);
    const result = await applyBulkUpdate({ ids: ["p1"], categoryId: "cat-x" });
    expect(result).toEqual({ ok: false, message: "Bitte eine Unterkategorie wählen." });
    expect(productMock.updateMany).not.toHaveBeenCalled();
  });

  it("does not queue anything when no product matched", async () => {
    productMock.updateMany.mockResolvedValue({ count: 0 });
    await applyBulkUpdate({ ids: ["gone"], isAvailable: false });
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
    expect(triggerBackgroundDrainMock).not.toHaveBeenCalled();
  });

  it("refuses an empty patch", async () => {
    expect(await applyBulkUpdate({ ids: ["p1"] })).toEqual({ ok: false, message: "Keine Änderung ausgewählt." });
  });
});
