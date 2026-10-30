import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const productMock = { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { product: productMock } }));

const isAssignableCategoryMock = vi.fn();
vi.mock("@/lib/category-guard", () => ({ CATEGORY_ERROR: "Kategorie wählen", isAssignableCategory: isAssignableCategoryMock }));

const enqueueProductSyncMock = vi.fn();
vi.mock("@/lib/sync/outbox", () => ({ enqueueProductSync: enqueueProductSyncMock }));
vi.mock("@/lib/sync/runner", () => ({ triggerBackgroundDrain: vi.fn() }));
vi.mock("@/lib/off-images", () => ({ attachOffImages: vi.fn() }));

const { applyQuickUpdate, createProduct, DUPLICATE_EAN_ERROR, PRODUCT_NOT_FOUND } = await import("./save-product");
const { SAVE_FAILED } = await import("./save-error");

const INPUT = {
  ean: "7612345678904",
  nameDe: "Mama Instant Noodles",
  categoryId: "cat-noodles",
  priceRappen: 350,
  vatRate: 2.6,
  unitType: "piece",
  storageType: "ambient",
  allergens: [],
  dataSource: "manual",
};

function prismaError(code: string) {
  return Object.assign(new Error(code), { code });
}

function savedRow(sku: string) {
  return {
    id: "p1",
    sku,
    ...INPUT,
    vatRate: { toNumber: () => 2.6 },
    nameOriginal: null,
    brand: null,
    originCountry: null,
    contentAmount: null,
    contentUnit: null,
    ingredientsDe: null,
    notes: null,
    isAvailable: true,
    dataComplete: false,
  };
}

beforeEach(() => {
  productMock.create.mockReset();
  productMock.update.mockReset();
  productMock.findFirst.mockReset().mockResolvedValue({ sku: "ASIA-00041" });
  productMock.findUnique.mockReset().mockResolvedValue(null);
  isAssignableCategoryMock.mockReset().mockResolvedValue(true);
  enqueueProductSyncMock.mockReset().mockResolvedValue(undefined);
});

describe("createProduct", () => {
  it("returns German field errors for a one-letter origin instead of failing silently", async () => {
    const result = await createProduct({ ...INPUT, originCountry: "T" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { originCountry: ["Bitte 2 Buchstaben eingeben, z.B. TH"] } });
    expect(productMock.create).not.toHaveBeenCalled();
  });

  it("reports a duplicate EAN as a message, not a thrown error", async () => {
    productMock.create.mockRejectedValue(prismaError("P2002"));
    productMock.findUnique.mockResolvedValue({ id: "other" });

    const result = await createProduct(INPUT);

    expect(result).toEqual({ ok: false, message: DUPLICATE_EAN_ERROR, fieldErrors: { ean: [DUPLICATE_EAN_ERROR] } });
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
  });

  it("retries once with a fresh SKU after a SKU collision", async () => {
    productMock.findFirst.mockResolvedValueOnce({ sku: "ASIA-00041" }).mockResolvedValueOnce({ sku: "ASIA-00042" });
    productMock.create.mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce(savedRow("ASIA-00043"));

    const result = await createProduct(INPUT);

    expect(result).toMatchObject({ ok: true, product: { sku: "ASIA-00043" } });
    expect(productMock.create.mock.calls.map(([arg]) => arg.data.sku)).toEqual(["ASIA-00042", "ASIA-00043"]);
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("p1");
  });

  it("gives up with a message after the second SKU collision", async () => {
    productMock.create.mockRejectedValue(prismaError("P2002"));
    await expect(createProduct(INPUT)).resolves.toEqual({ ok: false, message: SAVE_FAILED });
    expect(productMock.create).toHaveBeenCalledTimes(2);
  });

  it("rethrows other DB errors so the client shows 'Speichern fehlgeschlagen'", async () => {
    productMock.create.mockRejectedValue(new Error("Can't reach database server"));
    await expect(createProduct(INPUT)).rejects.toThrow("Can't reach database server");
  });
});

describe("applyQuickUpdate", () => {
  it("answers 'Artikel nicht gefunden' when the product was deleted meanwhile", async () => {
    productMock.update.mockRejectedValue(prismaError("P2025"));
    await expect(applyQuickUpdate({ id: "gone", priceRappen: 350, isAvailable: true })).resolves.toEqual({ ok: false, message: PRODUCT_NOT_FOUND });
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
  });

  it("updates and queues the product for the shop", async () => {
    productMock.update.mockResolvedValue(savedRow("ASIA-00041"));
    const result = await applyQuickUpdate({ id: "p1", priceRappen: 395, isAvailable: false });
    expect(result.ok).toBe(true);
    expect(productMock.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { priceRappen: 395, isAvailable: false } });
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("p1");
  });
});
