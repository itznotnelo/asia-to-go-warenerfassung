import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  shopOrder: { create: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() },
};
const prismaMock = {
  shopOrder: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("server-only", () => ({}));

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
  txMock.product.findMany.mockReset().mockResolvedValue([{ id: "prod_1" }]);
  txMock.product.updateMany.mockReset().mockResolvedValue({ count: 1 });
  fetchPendingOrdersMock.mockReset();
  ackOrderMock.mockReset().mockResolvedValue(undefined);
});

describe("importPendingOrders", () => {
  it("skips the network call when settings are incomplete", async () => {
    const result = await importPendingOrders({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result).toEqual({ imported: 0, failed: 0, failedOrderIds: [], skippedNoSettings: true });
    expect(fetchPendingOrdersMock).not.toHaveBeenCalled();
  });

  it("creates the order with its original time, decrements stock atomically with a 0 floor, then acks", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);

    const result = await importPendingOrders(settings);

    expect(result).toEqual({ imported: 1, failed: 0, failedOrderIds: [], skippedNoSettings: false });
    expect(txMock.shopOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "order_1",
        createdAt: new Date("2026-10-06T08:15:00.000Z"),
        items: { create: [{ productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2 }] },
      }),
    });
    expect(txMock.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "prod_1", stockQty: { not: null } },
      data: { stockQty: { decrement: 2 } },
    });
    expect(txMock.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "prod_1", stockQty: { lt: 0 } },
      data: { stockQty: 0 },
    });
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
            { productId: null, nameDe: "Mama Tom Yum", qty: 3 },
            { productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 1 },
          ],
        },
      }),
    });
    // Only the product that still exists gets a stock update.
    for (const [call] of txMock.product.updateMany.mock.calls) {
      expect(call.where.id).toBe("prod_1");
    }
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
    txMock.product.updateMany.mockRejectedValueOnce(new Error("connection terminated"));

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
