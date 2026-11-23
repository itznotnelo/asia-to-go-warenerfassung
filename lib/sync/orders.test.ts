import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  shopOrder: { create: vi.fn() },
  product: { findMany: vi.fn() },
};
const prismaMock = {
  shopOrder: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("server-only", () => ({}));

// The ledger itself is covered by lib/stock/ledger.integration.test.ts; here
// only that the import books the order's lines in its own transaction.
const bookWebOrderSalesMock = vi.fn();
vi.mock("@/lib/stock/web-orders", () => ({ bookWebOrderSales: bookWebOrderSalesMock }));
vi.mock("@/lib/stock/ledger", () => ({ getSafetyBuffer: vi.fn(async () => 1) }));

const fetchPendingOrdersMock = vi.fn();
const ackOrderMock = vi.fn();
vi.mock("./client", () => ({ fetchPendingOrders: fetchPendingOrdersMock, ackOrder: ackOrderMock }));

const { importPendingOrders } = await import("./orders");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    customerName: "Max Muster",
    customerPhone: null,
    fulfilmentType: "pickup",
    totalRappen: 2580,
    notes: null,
    createdAt: "2026-10-06T08:15:00.000Z",
    items: [{ productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.shopOrder.findUnique.mockReset().mockResolvedValue(null);
  prismaMock.$transaction.mockClear();
  txMock.shopOrder.create.mockReset().mockResolvedValue({});
  txMock.product.findMany.mockReset().mockResolvedValue([{ id: "prod_1", sku: "ASIA-00007", vatRate: 2.6 }]);
  txMock.shopOrder.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
  bookWebOrderSalesMock.mockReset().mockResolvedValue(1);
  fetchPendingOrdersMock.mockReset();
  ackOrderMock.mockReset().mockResolvedValue(undefined);
});

describe("importPendingOrders", () => {
  it("skips the network call when settings are incomplete", async () => {
    const result = await importPendingOrders({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result).toEqual({ imported: 0, failed: 0, failedOrderIds: [], skippedNoSettings: true });
    expect(fetchPendingOrdersMock).not.toHaveBeenCalled();
  });

  it("creates the order with its original time, books its stock in the same transaction, then acks", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);

    const result = await importPendingOrders(settings);

    expect(result).toEqual({ imported: 1, failed: 0, failedOrderIds: [], skippedNoSettings: false });
    expect(txMock.shopOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "order_1",
        createdAt: new Date("2026-10-06T08:15:00.000Z"),
        items: {
          create: [
            {
              productId: "prod_1",
              nameDe: "Jasminreis 5kg",
              qty: 2,
              sku: "ASIA-00007",
              unitPriceRappen: null,
              vatRate: 2.6,
              lineTotalRappen: null,
            },
          ],
        },
      }),
    });
    expect(bookWebOrderSalesMock).toHaveBeenCalledWith(txMock, "order_1", [expect.objectContaining({ productId: "prod_1", qty: 2 })], 1);
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });

  it("re-acks without a second transaction if the order was already imported", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);
    prismaMock.shopOrder.findUnique.mockResolvedValue({ id: "order_1" });

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });

  it("imports a line for a locally deleted product with productId null and keeps nameDe", async () => {
    fetchPendingOrdersMock.mockResolvedValue([
      pendingOrder({
        items: [
          { productId: "prod_gone", nameDe: "Mama Tom Yum", qty: 3 },
          { productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 1 },
        ],
      }),
    ]);

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(txMock.shopOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        items: {
          create: [
            { productId: null, nameDe: "Mama Tom Yum", qty: 3, sku: null, unitPriceRappen: null, vatRate: null, lineTotalRappen: null },
            {
              productId: "prod_1",
              nameDe: "Jasminreis 5kg",
              qty: 1,
              sku: "ASIA-00007",
              unitPriceRappen: null,
              vatRate: 2.6,
              lineTotalRappen: null,
            },
          ],
        },
      }),
    });
    // The deleted product's line has no productId, so it books no stock.
    expect(bookWebOrderSalesMock.mock.calls[0][2].map((item: { productId: string | null }) => item.productId)).toEqual([null, "prod_1"]);
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });

  it("a failing order does not block the orders behind it", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder({ id: "order_bad" }), pendingOrder({ id: "order_2" })]);
    txMock.shopOrder.create.mockRejectedValueOnce(new Error("P2003 foreign key"));

    const result = await importPendingOrders(settings);

    expect(result).toEqual({ imported: 1, failed: 1, failedOrderIds: ["order_bad"], skippedNoSettings: false });
    expect(ackOrderMock).toHaveBeenCalledTimes(1);
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_2");
  });

  it("a crash mid-import (during the stock update) is never acked, later orders still import", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder(), pendingOrder({ id: "order_2" })]);
    bookWebOrderSalesMock.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await importPendingOrders(settings);

    // Create and the failing decrement ran on the same tx client, so Postgres
    // rolls the order back; without an ack the backend offers it again.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(txMock.shopOrder.create).toHaveBeenCalledTimes(2);
    expect(ackOrderMock).not.toHaveBeenCalledWith(settings, "order_1");
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_2");
    expect(result).toEqual({ imported: 1, failed: 1, failedOrderIds: ["order_1"], skippedNoSettings: false });
  });

  it("an ack failure after commit counts as failed; the retry then only re-acks", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);
    ackOrderMock.mockRejectedValueOnce(new Error("ack order failed: HTTP 503"));

    const first = await importPendingOrders(settings);
    expect(first.failedOrderIds).toEqual(["order_1"]);

    prismaMock.shopOrder.findUnique.mockResolvedValue({ id: "order_1" });
    const second = await importPendingOrders(settings);
    expect(second.imported).toBe(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed orders by schema and still imports the valid ones", async () => {
    fetchPendingOrdersMock.mockResolvedValue([
      pendingOrder({ id: "order_chf", totalRappen: 12.5 }),
      pendingOrder({ id: "order_neg", items: [{ productId: "prod_1", nameDe: "Reis", qty: -1 }] }),
      pendingOrder({ id: "../../admin" }),
      pendingOrder({ id: "order_type", fulfilmentType: "drone" }),
      pendingOrder({ id: "order_str", totalRappen: "2580" }),
      pendingOrder({ id: "order_date", createdAt: "yesterday" }),
      "not an order",
      pendingOrder({ id: "order_ok" }),
    ]);

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(result.failedOrderIds).toEqual([
      "order_chf",
      "order_neg",
      "../../admin",
      "order_type",
      "order_str",
      "order_date",
      null,
    ]);
    expect(txMock.shopOrder.create).toHaveBeenCalledTimes(1);
    expect(ackOrderMock).toHaveBeenCalledTimes(1);
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_ok");
  });

  it("stores the backend's price/VAT snapshot per line, also for a locally deleted product", async () => {
    fetchPendingOrdersMock.mockResolvedValue([
      pendingOrder({
        totalRappen: 2580 + 1000,
        items: [
          { productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2, sku: "ASIA-00007", unitPriceRappen: 1290, lineTotalRappen: 2580, vatRate: 2.6 },
          { productId: "prod_gone", nameDe: "Sake 0.7l", qty: 1, sku: "ASIA-00031", unitPriceRappen: 1000, lineTotalRappen: 1000, vatRate: 8.1 },
        ],
      }),
    ]);

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(txMock.shopOrder.create.mock.calls[0][0].data.items.create).toEqual([
      { productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2, sku: "ASIA-00007", unitPriceRappen: 1290, vatRate: 2.6, lineTotalRappen: 2580 },
      // Deleted locally: the snapshot from the backend still keeps sku, price and VAT.
      { productId: null, nameDe: "Sake 0.7l", qty: 1, sku: "ASIA-00031", unitPriceRappen: 1000, vatRate: 8.1, lineTotalRappen: 1000 },
    ]);
    expect(txMock.shopOrder.create.mock.calls[0][0].data.fulfilmentType).toBe("pickup");
  });

  it("rejects orders whose price snapshot is inconsistent, and still imports the rest", async () => {
    const line = { productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2, unitPriceRappen: 1290, lineTotalRappen: 2580, vatRate: 2.6 };
    fetchPendingOrdersMock.mockResolvedValue([
      // Line totals add up to 2580, the order says 9999.
      pendingOrder({ id: "order_sum", totalRappen: 9999, items: [line] }),
      // lineTotal is not unitPrice * qty.
      pendingOrder({ id: "order_line", items: [{ ...line, lineTotalRappen: 2000 }] }),
      // Price without line total.
      pendingOrder({ id: "order_half", items: [{ ...line, lineTotalRappen: undefined }] }),
      // Prices on one line but not the other.
      pendingOrder({ id: "order_mixed", totalRappen: 2580 + 450, items: [line, { productId: null, nameDe: "Tofu", qty: 1 }] }),
      // Not a Swiss VAT rate.
      pendingOrder({ id: "order_vat", items: [{ ...line, vatRate: 7.7 }] }),
      // Rappen, not francs.
      pendingOrder({ id: "order_float", totalRappen: 25.8, items: [{ ...line, unitPriceRappen: 12.9, lineTotalRappen: 25.8 }] }),
      pendingOrder({ id: "order_ok", items: [line] }),
    ]);

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(result.failedOrderIds).toEqual(["order_sum", "order_line", "order_half", "order_mixed", "order_vat", "order_float"]);
    expect(ackOrderMock).toHaveBeenCalledTimes(1);
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_ok");
  });

  it("a response without an items array imports nothing and acks nothing", async () => {
    fetchPendingOrdersMock.mockResolvedValue(undefined);

    const result = await importPendingOrders(settings);

    expect(result).toEqual({ imported: 0, failed: 1, failedOrderIds: [null], skippedNoSettings: false });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(ackOrderMock).not.toHaveBeenCalled();
  });

  it("a non-JSON body (fetch rejects) propagates without acking anything", async () => {
    fetchPendingOrdersMock.mockRejectedValue(new SyntaxError("Unexpected token < in JSON"));

    await expect(importPendingOrders(settings)).rejects.toThrow(SyntaxError);
    expect(ackOrderMock).not.toHaveBeenCalled();
  });
});
