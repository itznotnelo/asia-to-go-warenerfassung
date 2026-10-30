import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";

const productMock = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
};
const syncOutboxMock = {
  upsert: vi.fn(),
  count: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: { product: productMock, syncOutbox: syncOutboxMock },
}));
vi.mock("server-only", () => ({}));

const { enqueueAllProductsSync, enqueueProductDeleteSync, enqueueProductSync } = await import("./outbox");
const { SHOP_DELETE_GRACE_MS } = await import("@/lib/archive-grace");

const category = { id: "cat_1", name: "Reis", slug: "reis", sortOrder: 0, parentId: null };

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod_1",
    ean: null,
    sku: "ASIA-00001",
    nameDe: "Jasminreis 5kg",
    nameOriginal: null,
    nameEn: null,
    brand: null,
    originCountry: "TH",
    categoryId: "cat_1",
    category,
    priceRappen: 1290,
    vatRate: 2.6,
    unitType: "weight",
    contentAmount: 5,
    contentUnit: "kg",
    storageType: "ambient",
    ingredientsDe: "Reis",
    allergens: [],
    traces: [],
    allergensConfirmedAt: new Date("2026-10-05T00:00:00.000Z"),
    nutrition: null,
    isAvailable: true,
    stockQty: 10,
    dataSource: "manual",
    dataComplete: true,
    notes: null,
    images: [],
    updatedAt: new Date("2026-10-06T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  productMock.findUnique.mockReset();
  productMock.findMany.mockReset();
  syncOutboxMock.upsert.mockReset();
  syncOutboxMock.count.mockReset();
});

describe("enqueueProductSync", () => {
  it("enqueues an upsert for the product and its category when eligible", async () => {
    productMock.findUnique.mockResolvedValue(makeProductRow());
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    expect(syncOutboxMock.upsert).toHaveBeenCalledTimes(2);
    const [productCall, categoryCall] = syncOutboxMock.upsert.mock.calls;
    expect(productCall[0].where).toEqual({ entityId: "prod_1" });
    expect(productCall[0].create.entityType).toBe("product");
    expect(productCall[0].create.payload.op).toBe("upsert");
    expect(categoryCall[0].where).toEqual({ entityId: "cat_1" });
    expect(categoryCall[0].create.entityType).toBe("category");
  });

  it("enqueues only a delete, no category op, when the product is incomplete", async () => {
    productMock.findUnique.mockResolvedValue(makeProductRow({ dataComplete: false }));
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    expect(syncOutboxMock.upsert).toHaveBeenCalledTimes(1);
    expect(syncOutboxMock.upsert.mock.calls[0][0].create.payload).toEqual({ op: "delete", id: "prod_1" });
  });

  it("sends vatRate and contentAmount as numbers, not Prisma.Decimal strings", async () => {
    productMock.findUnique.mockResolvedValue(
      makeProductRow({ vatRate: new Prisma.Decimal("2.6"), contentAmount: new Prisma.Decimal("0.5") }),
    );
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    const payload = JSON.parse(JSON.stringify(syncOutboxMock.upsert.mock.calls[0][0].create.payload));
    expect(payload.product.vatRate).toBe(2.6);
    expect(payload.product.contentAmount).toBe(0.5);
  });

  it("does nothing if the product no longer exists", async () => {
    productMock.findUnique.mockResolvedValue(null);

    await enqueueProductSync("prod_missing");

    expect(syncOutboxMock.upsert).not.toHaveBeenCalled();
  });

  it("resets attempts/lastError on a re-queue (clears a previous failure)", async () => {
    productMock.findUnique.mockResolvedValue(makeProductRow());
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    const productCall = syncOutboxMock.upsert.mock.calls[0][0];
    expect(productCall.update.attempts).toBe(0);
    expect(productCall.update.lastError).toBeNull();
  });
});

describe("enqueueProductSync for an archived product (review should #34)", () => {
  const archivedAt = new Date("2026-10-30T16:00:00.000Z");

  it("queues a delete held back until the grace period is over", async () => {
    productMock.findUnique.mockResolvedValue(makeProductRow({ archivedAt }));
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    expect(syncOutboxMock.upsert).toHaveBeenCalledTimes(1);
    const call = syncOutboxMock.upsert.mock.calls[0][0];
    expect(call.create.payload).toEqual({ op: "delete", id: "prod_1" });
    expect(call.create.notBefore).toEqual(new Date(archivedAt.getTime() + SHOP_DELETE_GRACE_MS));
    // A re-queue (bulk edit, "Alles synchronisieren") must not turn it into an immediate delete.
    expect(call.update.notBefore).toEqual(new Date(archivedAt.getTime() + SHOP_DELETE_GRACE_MS));
  });

  it("clears notBefore for a normal re-queue, so a restore replaces the pending delete at once", async () => {
    productMock.findUnique.mockResolvedValue(makeProductRow({ archivedAt: null }));
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductSync("prod_1");

    const call = syncOutboxMock.upsert.mock.calls[0][0];
    expect(call.create.payload.op).toBe("upsert");
    expect(call.create.notBefore).toBeNull();
    expect(call.update.notBefore).toBeNull();
  });

  it("reads and writes through the given transaction client, not the global one", async () => {
    const tx = {
      product: { findUnique: vi.fn().mockResolvedValue(makeProductRow({ archivedAt })) },
      syncOutbox: { upsert: vi.fn().mockResolvedValue({}) },
    };

    await enqueueProductSync("prod_1", tx as never);

    expect(tx.product.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.syncOutbox.upsert).toHaveBeenCalledTimes(1);
    expect(productMock.findUnique).not.toHaveBeenCalled();
    expect(syncOutboxMock.upsert).not.toHaveBeenCalled();
  });
});

describe("enqueueProductDeleteSync", () => {
  it("enqueues a bare delete op without reading the product back", async () => {
    syncOutboxMock.upsert.mockResolvedValue({});

    await enqueueProductDeleteSync("prod_1");

    expect(productMock.findUnique).not.toHaveBeenCalled();
    expect(syncOutboxMock.upsert).toHaveBeenCalledTimes(1);
    expect(syncOutboxMock.upsert.mock.calls[0][0].create.payload).toEqual({ op: "delete", id: "prod_1" });
    expect(syncOutboxMock.upsert.mock.calls[0][0].create.notBefore).toBeNull();
  });
});

describe("enqueueAllProductsSync", () => {
  it("enqueues every product and returns the count", async () => {
    productMock.findMany.mockResolvedValue([{ id: "prod_1" }, { id: "prod_2" }]);
    productMock.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(makeProductRow({ id: where.id })),
    );
    syncOutboxMock.upsert.mockResolvedValue({});

    const count = await enqueueAllProductsSync();

    expect(count).toBe(2);
    expect(productMock.findUnique).toHaveBeenCalledTimes(2);
  });
});
