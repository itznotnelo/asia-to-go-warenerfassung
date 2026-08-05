import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const offCacheMock = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: { offCache: offCacheMock },
}));
vi.mock("server-only", () => ({}));

const { fetchOffProduct } = await import("./client");

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  offCacheMock.findUnique.mockReset();
  offCacheMock.upsert.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOffProduct", () => {
  it("fetches, validates and caches a fresh hit", async () => {
    offCacheMock.findUnique.mockResolvedValue(null);
    offCacheMock.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: 1, product: { code: "123", product_name: "Test" } })),
    );

    const result = await fetchOffProduct("123");

    expect(result).toMatchObject({ found: true, fromCache: false });
    expect(result.product?.product_name).toBe("Test");
    expect(offCacheMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barcode: "123" },
        create: expect.objectContaining({ found: true }),
      }),
    );
  });

  it("caches a confirmed miss (status 0, no product field)", async () => {
    offCacheMock.findUnique.mockResolvedValue(null);
    offCacheMock.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: 0, status_verbose: "product not found" })),
    );

    const result = await fetchOffProduct("000");

    expect(result.found).toBe(false);
    expect(result.error).toBeUndefined();
    expect(offCacheMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ found: false }) }),
    );
  });

  it("treats an HTTP 404 as a confirmed miss, not an error (OFF is inconsistent here)", async () => {
    offCacheMock.findUnique.mockResolvedValue(null);
    offCacheMock.upsert.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));

    const result = await fetchOffProduct("8801043017135");

    expect(result.found).toBe(false);
    expect(result.error).toBeUndefined();
    expect(offCacheMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ found: false }) }),
    );
  });

  it("returns a cached hit within the 30-day TTL without hitting the network", async () => {
    offCacheMock.findUnique.mockResolvedValue({
      barcode: "123",
      found: true,
      rawJson: { status: 1, product: { code: "123", product_name: "Cached" } },
      fetchedAt: new Date(),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchOffProduct("123");

    expect(result.fromCache).toBe(true);
    expect(result.product?.product_name).toBe("Cached");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refetches once a cache entry is older than 30 days", async () => {
    const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    offCacheMock.findUnique.mockResolvedValue({
      barcode: "123",
      found: true,
      rawJson: { status: 1, product: { code: "123", product_name: "Old" } },
      fetchedAt: stale,
    });
    offCacheMock.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: 1, product: { code: "123", product_name: "Fresh" } })),
    );

    const result = await fetchOffProduct("123");

    expect(result.fromCache).toBe(false);
    expect(result.product?.product_name).toBe("Fresh");
  });

  it("does not cache a network error and reports it distinctly from a confirmed miss", async () => {
    offCacheMock.findUnique.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await fetchOffProduct("123");

    expect(result.found).toBe(false);
    expect(result.error).toBe(true);
    expect(offCacheMock.upsert).not.toHaveBeenCalled();
  });

  it("treats a 5xx as an uncached error, unlike a 404", async () => {
    offCacheMock.findUnique.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 503)));

    const result = await fetchOffProduct("123");

    expect(result.error).toBe(true);
    expect(offCacheMock.upsert).not.toHaveBeenCalled();
  });

  it("refetches when a cache entry has no usable product despite found=true", async () => {
    offCacheMock.findUnique.mockResolvedValue({
      barcode: "123",
      found: true,
      rawJson: { garbage: true },
      fetchedAt: new Date(),
    });
    offCacheMock.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: 1, product: { code: "123", product_name: "Refetched" } })),
    );

    const result = await fetchOffProduct("123");

    expect(result.fromCache).toBe(false);
    expect(result.product?.product_name).toBe("Refetched");
  });
});
