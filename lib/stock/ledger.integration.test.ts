import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Real-Postgres test of the stock ledger: transactions, row locks and the
// cached-stock invariant can't be proven with mocks. Runs against
// DATABASE_URL (CI's verify job has a fresh Postgres 18) in its own
// throwaway schema, migrated with `prisma migrate deploy`. Skipped when no
// database is reachable (plain `pnpm test` on a laptop without Postgres).

const baseUrl = process.env.DATABASE_URL;

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const canRun = await reachable(baseUrl);
const schema = `it_stock_${process.pid}_${Date.now()}`;

function urlWithSchema(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

// search_path too: the ledger's raw SQL (row lock) uses unqualified names, like production's public schema.
const db = canRun ? new PrismaClient({ adapter: new PrismaPg({ connectionString: baseUrl, options: `-c search_path=${schema}` }, { schema }) }) : (null as unknown as PrismaClient);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/sync/runner", () => ({ triggerBackgroundDrain: vi.fn() }));

const ledger = await import("./ledger");
const legacyModule = await import("./legacy");
const receipts = await import("./receipts");
const stocktakes = await import("./stocktakes");
const sales = await import("./sales");
const productStock = await import("./product-stock");
const webOrders = await import("./web-orders");
const orderCancel = await import("./order-cancel");

let categoryId = "";
let eanCounter = 0;

async function makeProduct(over: { stockQty?: number | null; isAvailable?: boolean } = {}) {
  eanCounter += 1;
  return db.product.create({
    data: {
      sku: `IT-${eanCounter}-${Date.now()}`,
      nameDe: `Testartikel ${eanCounter}`,
      categoryId,
      priceRappen: 295,
      unitType: "piece",
      storageType: "ambient",
      dataSource: "manual",
      stockQty: over.stockQty ?? null,
      isAvailable: over.isAvailable ?? true,
    },
  });
}

async function stockOf(productId: string) {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const sum = await db.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } });
  return { stockQty: product.stockQty, ledger: sum._sum.quantity ?? 0, isAvailable: product.isAvailable };
}

/** The core invariant: cached stock equals the ledger sum. */
async function expectConsistent(productId: string, expected: number) {
  const { stockQty, ledger: sum } = await stockOf(productId);
  expect(stockQty).toBe(expected);
  expect(sum).toBe(expected);
}

function ok<T>(result: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.data;
}

describe.skipIf(!canRun)("stock ledger on Postgres", () => {
  beforeAll(async () => {
    execFileSync(path.resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: urlWithSchema(baseUrl as string) },
      stdio: "pipe",
    });
    const category = await db.category.create({ data: { name: "Test", slug: `test-${schema}` } });
    categoryId = category.id;
  }, 120_000);

  afterAll(async () => {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.stockSettings.deleteMany();
  });

  it("books a receipt in cartons: stock, lot, EK, supplier, receipt movement, consistent cache", async () => {
    const product = await makeProduct();
    const supplier = await db.supplier.create({ data: { name: "Asia Express" } });
    const { id: receiptId } = ok(await receipts.createReceipt({ supplierId: supplier.id, deliveryNote: "LS-1" }));
    ok(await receipts.addReceiptLine({ receiptId, productId: product.id, packs: 3, packSize: 24, unitCostRappen: 95, expiryDate: "2027-03-01", batchCode: "B7" }));
    ok(await receipts.bookReceipt({ id: receiptId }));

    await expectConsistent(product.id, 72);
    const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.purchasePriceRappen).toBe(95);
    expect(after.packSize).toBe(24);
    expect(after.defaultSupplierId).toBe(supplier.id);
    const lots = await db.stockLot.findMany({ where: { productId: product.id } });
    expect(lots).toHaveLength(1);
    expect(lots[0].batchCode).toBe("B7");
    const movement = await db.stockMovement.findFirstOrThrow({ where: { productId: product.id } });
    expect(movement).toMatchObject({ type: "receipt", quantity: 72, stockAfter: 72, unitCostRappen: 95, lotId: lots[0].id, goodsReceiptId: receiptId });

    // A second click must not book it twice.
    const again = await receipts.bookReceipt({ id: receiptId });
    expect(again.ok).toBe(false);
    await expectConsistent(product.id, 72);
  });

  it("refuses a shop sale on an untracked article, allows negative stock on a tracked one", async () => {
    const untracked = await makeProduct();
    expect((await sales.bookShopSale({ productId: untracked.id, quantity: 1 })).ok).toBe(false);
    expect(await db.stockMovement.count({ where: { productId: untracked.id } })).toBe(0);

    const tracked = await makeProduct({ stockQty: 0 });
    const sold = ok(await sales.bookShopSale({ productId: tracked.id, quantity: 2 }));
    expect(sold.stockAfter).toBe(-2);
    await expectConsistent(tracked.id, -2);
  });

  it("derives webshop availability from stock above the safety buffer and queues the shop sync", async () => {
    await db.stockSettings.create({ data: { id: 1, shopSafetyBuffer: 2 } });
    const product = await makeProduct({ stockQty: 0, isAvailable: false });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: product.id, quantity: 3, note: "Test" }));
    expect((await stockOf(product.id)).isAvailable).toBe(true);
    expect(await db.syncOutbox.count({ where: { entityId: product.id } })).toBe(1);

    ok(await sales.bookShopSale({ productId: product.id, quantity: 1 }));
    expect((await stockOf(product.id)).isAvailable).toBe(false);
    await expectConsistent(product.id, 2);

    // Raising the buffer re-derives every tracked article.
    const plenty = await makeProduct({ stockQty: 0, isAvailable: false });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: plenty.id, quantity: 5, note: "Test" }));
    expect((await stockOf(plenty.id)).isAvailable).toBe(true);
    await db.stockSettings.update({ where: { id: 1 }, data: { shopSafetyBuffer: 5 } });
    await db.$transaction((tx) => ledger.refreshAllAvailability(tx, 5));
    expect((await stockOf(plenty.id)).isAvailable).toBe(false);
  });

  it("keeps the manual flag for untracked articles and when tracking is turned off", async () => {
    const product = await makeProduct({ isAvailable: false });
    ok(await productStock.saveProductStockSettings({ productId: product.id, tracked: false, minStock: 3, reorderQty: 12, packSize: 6, purchasePriceRappen: 80, defaultSupplierId: null }));
    expect(await stockOf(product.id)).toEqual({ stockQty: null, ledger: 0, isAvailable: false });
  });

  it("turns tracking off (stock null, flag kept) and back on (stock = ledger sum)", async () => {
    const product = await makeProduct({ stockQty: 0 });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: product.id, quantity: 7, note: "Start" }));
    const settings = { productId: product.id, minStock: null, reorderQty: null, packSize: 1, purchasePriceRappen: null, defaultSupplierId: null };
    ok(await productStock.saveProductStockSettings({ ...settings, tracked: false }));
    expect(await stockOf(product.id)).toEqual({ stockQty: null, ledger: 7, isAvailable: true });
    ok(await productStock.saveProductStockSettings({ ...settings, tracked: true }));
    await expectConsistent(product.id, 7);
  });

  it("undoes only the newest movement, by booking a reversal", async () => {
    const product = await makeProduct({ stockQty: 0 });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: product.id, quantity: 10, note: "Start" }));
    const sale = ok(await sales.bookShopSale({ productId: product.id, quantity: 3 }));
    const first = await db.stockMovement.findFirstOrThrow({ where: { productId: product.id, type: "manual" } });

    expect((await productStock.undoStockMovement({ movementId: first.id })).ok).toBe(false);
    ok(await productStock.undoStockMovement({ movementId: sale.movementId }));
    await expectConsistent(product.id, 10);
    const reversal = await db.stockMovement.findFirstOrThrow({ where: { reversesId: sale.movementId } });
    expect(reversal).toMatchObject({ type: "sale_shop", quantity: 3, stockAfter: 10 });

    // Neither the reversal nor the undone sale can be undone again.
    expect((await productStock.undoStockMovement({ movementId: reversal.id })).ok).toBe(false);
    expect((await productStock.undoStockMovement({ movementId: sale.movementId })).ok).toBe(false);
  });

  it("books a stocktake as counted minus expected, keeping sales made during the count", async () => {
    const counted = await makeProduct({ stockQty: 0 });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: counted.id, quantity: 10, note: "Start" }));
    const fresh = await makeProduct(); // untracked: the count starts tracking
    const { id } = ok(await stocktakes.createStocktake({ title: "Regal 3", categoryId: null }));

    ok(await stocktakes.countStocktakeLine({ stocktakeId: id, productId: counted.id, mode: "add", quantity: 1 }));
    ok(await stocktakes.countStocktakeLine({ stocktakeId: id, productId: counted.id, mode: "add", quantity: 1 }));
    const typed = ok(await stocktakes.countStocktakeLine({ stocktakeId: id, productId: counted.id, mode: "set", quantity: 8 }));
    expect(typed).toEqual({ countedQty: 8, expectedQty: 10 });
    ok(await stocktakes.countStocktakeLine({ stocktakeId: id, productId: fresh.id, mode: "set", quantity: 5 }));

    // 3 sold after counting, before booking.
    ok(await sales.bookShopSale({ productId: counted.id, quantity: 3 }));
    const booked = ok(await stocktakes.bookStocktake({ id }));
    expect(booked.corrected).toBe(2);

    await expectConsistent(counted.id, 5); // 10 - 3 sold - 2 missing
    await expectConsistent(fresh.id, 5);
    const correction = await db.stockMovement.findFirstOrThrow({ where: { productId: counted.id, type: "count_correction" } });
    expect(correction).toMatchObject({ quantity: -2, stocktakeId: id });
    expect((await stocktakes.bookStocktake({ id })).ok).toBe(false);
  });

  it("books web order lines for tracked articles only and gives them back on cancel", async () => {
    const tracked = await makeProduct({ stockQty: 0 });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: tracked.id, quantity: 4, note: "Start" }));
    const untracked = await makeProduct();
    const order = await db.shopOrder.create({
      data: { id: `ord_${Date.now()}`, customerName: "Test", fulfilmentType: "pickup", totalRappen: 590 },
    });
    const booked = await db.$transaction((tx) =>
      webOrders.bookWebOrderSales(tx, order.id, [
        { productId: tracked.id, qty: 2 },
        { productId: untracked.id, qty: 1 },
        { productId: null, qty: 1 },
      ], 1),
    );
    expect(booked).toBe(1);
    await expectConsistent(tracked.id, 2);
    expect(await stockOf(untracked.id)).toMatchObject({ stockQty: null, ledger: 0 });

    // Web sales are not undone one by one.
    const sale = await db.stockMovement.findFirstOrThrow({ where: { shopOrderId: order.id } });
    expect((await productStock.undoStockMovement({ movementId: sale.id })).ok).toBe(false);

    ok(await orderCancel.cancelWebOrder({ orderId: order.id }));
    await expectConsistent(tracked.id, 4);
    expect((await db.shopOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("cancelled");
    expect((await orderCancel.cancelWebOrder({ orderId: order.id })).ok).toBe(false);
  });

  it("writes off what is left of a lot (FEFO) with the reason", async () => {
    const product = await makeProduct();
    const { id: receiptId } = ok(await receipts.createReceipt({ supplierId: null, deliveryNote: null }));
    ok(await receipts.addReceiptLine({ receiptId, productId: product.id, packs: 10, packSize: 1, unitCostRappen: null, expiryDate: "2026-12-01", batchCode: null }));
    ok(await receipts.addReceiptLine({ receiptId, productId: product.id, packs: 10, packSize: 1, unitCostRappen: null, expiryDate: "2027-06-01", batchCode: null }));
    ok(await receipts.bookReceipt({ id: receiptId }));
    ok(await sales.bookShopSale({ productId: product.id, quantity: 4 }));

    const early = await db.stockLot.findFirstOrThrow({ where: { productId: product.id }, orderBy: { expiryDate: "asc" } });
    const written = ok(await productStock.writeOffLot({ lotId: early.id, wasteReason: "expired" }));
    expect(written.quantity).toBe(6);
    await expectConsistent(product.id, 10);
    expect((await productStock.writeOffLot({ lotId: early.id, wasteReason: "expired" })).ok).toBe(false);
    const waste = await db.stockMovement.findFirstOrThrow({ where: { productId: product.id, type: "waste" } });
    expect(waste).toMatchObject({ quantity: -6, wasteReason: "expired", lotId: early.id });
  });

  it("serialises parallel bookings on one article (row lock), cache stays consistent", async () => {
    const product = await makeProduct({ stockQty: 0 });
    ok(await productStock.bookProductMovement({ kind: "manual", productId: product.id, quantity: 50, note: "Start" }));
    const results = await Promise.all(Array.from({ length: 10 }, () => sales.bookShopSale({ productId: product.id, quantity: 1 })));
    expect(results.every((r) => r.ok)).toBe(true);
    await expectConsistent(product.id, 40);
    const afters = (await db.stockMovement.findMany({ where: { productId: product.id, type: "sale_shop" } })).map((m) => m.stockAfter).sort((a, b) => a - b);
    expect(afters).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
  });

  it("migrates a v0.2 stockQty into one opening movement, once", async () => {
    const legacy = await makeProduct({ stockQty: 17 });
    const zero = await makeProduct({ stockQty: 0 });
    const created = await db.$transaction((tx) => legacyModule.backfillLegacyStock(tx));
    expect(created).toBeGreaterThanOrEqual(1);
    await expectConsistent(legacy.id, 17);
    const opening = await db.stockMovement.findFirstOrThrow({ where: { productId: legacy.id } });
    expect(opening).toMatchObject({ type: "manual", quantity: 17, stockAfter: 17, note: legacyModule.LEGACY_OPENING_NOTE });
    await expectConsistent(zero.id, 0);

    expect(await db.$transaction((tx) => legacyModule.backfillLegacyStock(tx))).toBe(0);
    await expectConsistent(legacy.id, 17);
  });

  it("corrects stock to a counted value from the article page", async () => {
    const product = await makeProduct();
    ok(await productStock.bookProductMovement({ kind: "correction", productId: product.id, countedQty: 12, note: null }));
    await expectConsistent(product.id, 12);
    expect(ok(await productStock.bookProductMovement({ kind: "correction", productId: product.id, countedQty: 12, note: null }))).toBeNull();
    ok(await productStock.bookProductMovement({ kind: "return", productId: product.id, quantity: 2, supplierId: null, note: "kaputt geliefert" }));
    ok(await productStock.bookProductMovement({ kind: "waste", productId: product.id, quantity: 1, wasteReason: "damaged", note: null }));
    await expectConsistent(product.id, 9);
  });
});
