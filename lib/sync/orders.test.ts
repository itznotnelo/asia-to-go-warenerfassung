import { beforeEach, describe, expect, it, vi } from "vitest";

const shopOrderMock = { findUnique: vi.fn(), create: vi.fn() };
const productMock = { findUnique: vi.fn(), update: vi.fn() };

vi.mock("@/lib/prisma", () => ({ prisma: { shopOrder: shopOrderMock, product: productMock } }));
vi.mock("server-only", () => ({}));

const fetchPendingOrdersMock = vi.fn();
const ackOrderMock = vi.fn();
vi.mock("./client", () => ({ fetchPendingOrders: fetchPendingOrdersMock, ackOrder: ackOrderMock }));

const { applyOrderToStock, importPendingOrders } = await import("./orders");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    customerName: "Max Muster",
    customerPhone: null,
    fulfilmentType: "pickup",
    totalRappen: 2580,
    notes: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    items: [{ productId: "prod_1", nameDe: "Jasminreis 5kg", qty: 2 }],
    ...overrides,
  };
}

beforeEach(() => {
  shopOrderMock.findUnique.mockReset();
  shopOrderMock.create.mockReset().mockResolvedValue({});
  productMock.findUnique.mockReset();
  productMock.update.mockReset().mockResolvedValue({});
  fetchPendingOrdersMock.mockReset();
  ackOrderMock.mockReset().mockResolvedValue(undefined);
});

describe("applyOrderToStock", () => {
  it("decrements stock by the ordered qty", () => {
    expect(applyOrderToStock(10, 2)).toBe(8);
  });

  it("floors at 0 instead of going negative", () => {
    expect(applyOrderToStock(1, 5)).toBe(0);
  });

  it("leaves untracked stock (null) untouched", () => {
    expect(applyOrderToStock(null, 5)).toBeNull();
  });
});

describe("importPendingOrders", () => {
  it("skips the network call when settings are incomplete", async () => {
    const result = await importPendingOrders({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result).toEqual({ imported: 0, skippedNoSettings: true });
    expect(fetchPendingOrdersMock).not.toHaveBeenCalled();
  });

  it("creates the local order, decrements stock, and acks", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);
    shopOrderMock.findUnique.mockResolvedValue(null);
    productMock.findUnique.mockResolvedValue({ id: "prod_1", stockQty: 10 });

    const result = await importPendingOrders(settings);

    expect(result).toEqual({ imported: 1, skippedNoSettings: false });
    expect(shopOrderMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "order_1" }) }),
    );
    expect(productMock.update).toHaveBeenCalledWith({ where: { id: "prod_1" }, data: { stockQty: 8 } });
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });

  it("re-acks without re-applying the stock decrement if the order was already imported", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);
    shopOrderMock.findUnique.mockResolvedValue({ id: "order_1" });

    const result = await importPendingOrders(settings);

    expect(result.imported).toBe(1);
    expect(shopOrderMock.create).not.toHaveBeenCalled();
    expect(productMock.update).not.toHaveBeenCalled();
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });

  it("skips the stock update for an item whose product was deleted locally", async () => {
    fetchPendingOrdersMock.mockResolvedValue([pendingOrder()]);
    shopOrderMock.findUnique.mockResolvedValue(null);
    productMock.findUnique.mockResolvedValue(null);

    await importPendingOrders(settings);

    expect(productMock.update).not.toHaveBeenCalled();
    expect(ackOrderMock).toHaveBeenCalledWith(settings, "order_1");
  });
});
