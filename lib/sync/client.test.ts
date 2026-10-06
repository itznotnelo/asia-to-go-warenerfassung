import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ackOrder, fetchPendingOrders, publishOps, uploadImageToBackend } = await import("./client");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishOps", () => {
  it("POSTs the ops array with device auth headers", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await publishOps(settings, [{ op: "delete", id: "prod_1" }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://atg-shop.example.workers.dev/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-device-id": "shop-pc", authorization: "Bearer secret-key" }),
        body: JSON.stringify({ ops: [{ op: "delete", id: "prod_1" }] }),
      }),
    );
  });

  it("throws on a non-ok response, carrying the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 401)));

    await expect(publishOps(settings, [])).rejects.toThrow("HTTP 401");
  });

  it("strips a trailing slash from apiUrl before building the request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await publishOps({ ...settings, apiUrl: "https://atg-shop.example.workers.dev/" }, []);

    expect(fetchSpy).toHaveBeenCalledWith("https://atg-shop.example.workers.dev/publish", expect.anything());
  });
});

describe("uploadImageToBackend", () => {
  it("sends the product/image headers and returns the r2Key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ r2Key: "products/prod_1/front-123.jpg" }));
    vi.stubGlobal("fetch", fetchSpy);

    const r2Key = await uploadImageToBackend(settings, "prod_1", "front", Buffer.from("fake-bytes"), "image/jpeg");

    expect(r2Key).toBe("products/prod_1/front-123.jpg");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://atg-shop.example.workers.dev/images",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-product-id": "prod_1", "x-image-type": "front", "content-type": "image/jpeg" }),
      }),
    );
  });
});

describe("fetchPendingOrders", () => {
  it("returns the items array", async () => {
    const items = [{ id: "order_1", customerName: "Max", customerPhone: null, fulfilmentType: "pickup", totalRappen: 1000, notes: null, createdAt: "2026-10-06T00:00:00.000Z", items: [] }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items })));

    const result = await fetchPendingOrders(settings);

    expect(result).toEqual(items);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 401)));
    await expect(fetchPendingOrders(settings)).rejects.toThrow("HTTP 401");
  });
});

describe("ackOrder", () => {
  it("POSTs to /orders/:id/ack", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ applied: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await ackOrder(settings, "order_1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://atg-shop.example.workers.dev/orders/order_1/ack",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
