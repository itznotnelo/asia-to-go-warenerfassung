import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const productMock = { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() };
// The SKU counter row, simulated with real transaction semantics: an error
// inside $transaction rolls the increment back, like Postgres does.
let counterValue = 41;
const skuCounterMock = { upsert: vi.fn() };
const txClient = { product: productMock, skuCounter: skuCounterMock };
const prismaMock = {
  product: productMock,
  skuCounter: skuCounterMock,
  $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
    const before = counterValue;
    try {
      return await fn(txClient);
    } catch (error) {
      counterValue = before;
      throw error;
    }
  }),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const assignableCategoryMock = vi.fn();
vi.mock("@/lib/category-guard", () => ({ CATEGORY_ERROR: "Kategorie wählen", assignableCategory: assignableCategoryMock }));

const enqueueProductSyncMock = vi.fn();
vi.mock("@/lib/sync/outbox", () => ({ enqueueProductSync: enqueueProductSyncMock }));
vi.mock("@/lib/sync/runner", () => ({ triggerBackgroundDrain: vi.fn() }));
vi.mock("@/lib/off-images", () => ({ attachOffImages: vi.fn() }));

const { applyQuickUpdate, createProduct, DUPLICATE_EAN_ERROR, formatSku, PRODUCT_NOT_FOUND } = await import("./save-product");
const { SAVE_FAILED } = await import("./save-error");

const INPUT = {
  ean: "7612345678900",
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
    kind: "food",
    nameOriginal: null,
    brand: null,
    originCountry: null,
    contentAmount: null,
    contentUnit: null,
    ingredientsDe: null,
    traces: [],
    allergensConfirmedAt: null,
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
  counterValue = 41;
  skuCounterMock.upsert.mockReset().mockImplementation(async () => {
    counterValue += 1;
    return { id: 1, value: counterValue };
  });
  prismaMock.$transaction.mockClear();
  prismaMock.$queryRaw.mockReset().mockResolvedValue([{ max: 41 }]);
  prismaMock.$executeRaw.mockReset().mockResolvedValue(1);
  assignableCategoryMock.mockReset().mockResolvedValue({ slug: "instantnudeln", parentSlug: "nudeln-reis" });
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
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("takes the SKU from the counter inside the create transaction, never from existing products", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));

    await createProduct(INPUT);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(skuCounterMock.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(productMock.create.mock.calls[0][0].data.sku).toBe("ASIA-00042");
    expect(productMock.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("never reissues the SKU of a deleted newest product", async () => {
    // ASIA-00042 was issued and its product deleted again: products max is
    // 41, but the counter already stands at 42.
    counterValue = 42;
    productMock.create.mockResolvedValue(savedRow("ASIA-00043"));

    await createProduct(INPUT);

    expect(productMock.create.mock.calls[0][0].data.sku).toBe("ASIA-00043");
  });

  it("keeps counting past ASIA-99999 (no text-sort stall)", async () => {
    counterValue = 99_999;
    productMock.create.mockResolvedValue(savedRow("ASIA-100000"));

    await createProduct(INPUT);

    expect(productMock.create.mock.calls[0][0].data.sku).toBe("ASIA-100000");
  });

  it("a failed create rolls the counter back, so no number is skipped", async () => {
    productMock.create.mockRejectedValueOnce(new Error("Can't reach database server"));
    await expect(createProduct(INPUT)).rejects.toThrow();

    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    await createProduct(INPUT);

    expect(productMock.create.mock.calls.map(([arg]) => arg.data.sku)).toEqual(["ASIA-00042", "ASIA-00042"]);
  });

  it("on a SKU collision moves the counter past the highest existing SKU and retries once", async () => {
    // Counter says 41, but ASIA-00042..57 already exist (e.g. a restored older DB).
    prismaMock.$queryRaw.mockResolvedValue([{ max: 57 }]);
    prismaMock.$executeRaw.mockImplementation(async () => {
      counterValue = Math.max(counterValue, 57);
      return 1;
    });
    productMock.create.mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce(savedRow("ASIA-00058"));

    const result = await createProduct(INPUT);

    expect(result).toMatchObject({ ok: true, product: { sku: "ASIA-00058" } });
    expect(productMock.create.mock.calls.map(([arg]) => arg.data.sku)).toEqual(["ASIA-00042", "ASIA-00058"]);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("p1");
  });

  it("gives up with a message after the second SKU collision", async () => {
    productMock.create.mockRejectedValue(prismaError("P2002"));
    await expect(createProduct(INPUT)).resolves.toEqual({ ok: false, message: SAVE_FAILED });
    expect(productMock.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("never stores OFF allergens as confirmed unless the user ticked the box", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    await createProduct({ ...INPUT, dataSource: "openfoodfacts", allergens: ["gluten"], traces: ["sesame"] });

    const data = productMock.create.mock.calls[0][0].data;
    expect(data.allergensConfirmedAt).toBeNull();
    expect(data.dataComplete).toBe(false);
    expect(data.traces).toEqual(["sesame"]);
  });

  it("saves OFF nutrition with the new product (#30)", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    const nutrition = { energyKcal100g: 539, fat100g: 30.9 };
    await createProduct({ ...INPUT, dataSource: "openfoodfacts", nutrition });
    expect(productMock.create.mock.calls[0][0].data.nutrition).toEqual(nutrition);
  });

  it("leaves nutrition out when none came with the scan (#30)", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    await createProduct(INPUT);
    expect(productMock.create.mock.calls[0][0].data).not.toHaveProperty("nutrition");
  });

  it("rejects a weight article in Stk before touching the DB (#32)", async () => {
    const result = await createProduct({ ...INPUT, unitType: "weight", contentAmount: 5, contentUnit: "stk" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { contentUnit: ["Offen nach Gewicht braucht g oder kg"] } });
    expect(productMock.create).not.toHaveBeenCalled();
  });

  it("stamps allergensConfirmedAt when the user confirmed", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    await createProduct({ ...INPUT, allergens: ["gluten"], allergensConfirmed: true });
    expect(productMock.create.mock.calls[0][0].data.allergensConfirmedAt).toBeInstanceOf(Date);
  });

  it("refuses a top-level category before touching the DB", async () => {
    assignableCategoryMock.mockResolvedValue(null);
    const result = await createProduct(INPUT);
    expect(result).toMatchObject({ ok: false, fieldErrors: { categoryId: ["Kategorie wählen"] } });
    expect(productMock.create).not.toHaveBeenCalled();
  });

  it("takes the kind from the category when the form sends none (#27)", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    assignableCategoryMock.mockResolvedValueOnce({ slug: "kuechenutensilien", parentSlug: "non-food" });
    await createProduct({ ...INPUT, nameDe: "Bambusdampfkorb, 25 cm", vatRate: 8.1 });
    expect(productMock.create.mock.calls[0][0].data.kind).toBe("non_food");

    await createProduct(INPUT);
    expect(productMock.create.mock.calls[1][0].data.kind).toBe("food");
  });

  it("keeps a kind the form sent, whatever the category says (#27)", async () => {
    productMock.create.mockResolvedValue(savedRow("ASIA-00042"));
    assignableCategoryMock.mockResolvedValue({ slug: "kuechenutensilien", parentSlug: "non-food" });
    await createProduct({ ...INPUT, kind: "food" });
    expect(productMock.create.mock.calls[0][0].data.kind).toBe("food");
  });

  it("rethrows other DB errors so the client shows 'Speichern fehlgeschlagen'", async () => {
    productMock.create.mockRejectedValue(new Error("Can't reach database server"));
    await expect(createProduct(INPUT)).rejects.toThrow("Can't reach database server");
  });
});

describe("formatSku", () => {
  it("pads to five digits and grows beyond", () => {
    expect(formatSku(1)).toBe("ASIA-00001");
    expect(formatSku(42)).toBe("ASIA-00042");
    expect(formatSku(123_456)).toBe("ASIA-123456");
  });
});

describe("applyQuickUpdate", () => {
  beforeEach(() => {
    productMock.findUnique.mockResolvedValue({ stockQty: null });
  });

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

  it("answers 'Artikel nicht gefunden' without writing when the product is gone before the update", async () => {
    productMock.findUnique.mockResolvedValue(null);
    await expect(applyQuickUpdate({ id: "gone", priceRappen: 350, isAvailable: true })).resolves.toEqual({ ok: false, message: PRODUCT_NOT_FOUND });
    expect(productMock.update).not.toHaveBeenCalled();
  });

  it("keeps the stock-derived availability of a tracked article and only changes the price", async () => {
    productMock.findUnique.mockResolvedValue({ stockQty: 12 });
    productMock.update.mockResolvedValue(savedRow("ASIA-00041"));
    await applyQuickUpdate({ id: "p1", priceRappen: 395, isAvailable: false });
    expect(productMock.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { priceRappen: 395 } });
  });

  it("rejects a price above CHF 10'000 (a scanned EAN in the price field) before touching the DB", async () => {
    const result = await applyQuickUpdate({ id: "p1", priceRappen: 76123456789014, isAvailable: true });
    expect(result.ok).toBe(false);
    expect(productMock.update).not.toHaveBeenCalled();
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
  });
});
