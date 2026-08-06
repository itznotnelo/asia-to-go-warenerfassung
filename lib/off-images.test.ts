import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const downloadMock = vi.fn();
vi.mock("@/lib/images", () => ({ downloadAndStoreImage: (...args: unknown[]) => downloadMock(...args) }));

const createMock = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { productImage: { create: (...args: unknown[]) => createMock(...args) } } }));

const { attachOffImages } = await import("./off-images");

beforeEach(() => {
  downloadMock.mockReset();
  createMock.mockReset().mockResolvedValue({});
});

describe("attachOffImages", () => {
  it("downloads and stores every provided image type, attributing the source", async () => {
    downloadMock.mockImplementation((_url: string, _sku: string, type: string) =>
      Promise.resolve({ path: `ASIA-00001/${type}.webp`, width: 800, height: 600 }),
    );

    const count = await attachOffImages("product-1", "ASIA-00001", {
      front: "https://off.example/front.jpg",
      ingredients: "https://off.example/ingredients.jpg",
      nutrition: "https://off.example/nutrition.jpg",
    });

    expect(count).toBe(3);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(createMock.mock.calls[0][0].data).toMatchObject({
      productId: "product-1",
      type: "front",
      path: "ASIA-00001/front.webp",
      sourceAttribution: expect.stringContaining("Open Food Facts"),
    });
  });

  it("skips image types with no URL", async () => {
    downloadMock.mockResolvedValue({ path: "x", width: 1, height: 1 });

    const count = await attachOffImages("product-1", "ASIA-00001", { front: "https://off.example/front.jpg" });

    expect(count).toBe(1);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).toHaveBeenCalledWith("https://off.example/front.jpg", "ASIA-00001", "front");
  });

  it("does not create a ProductImage row when the download fails, and continues with the rest", async () => {
    downloadMock.mockImplementation((_url: string, _sku: string, type: string) =>
      Promise.resolve(type === "front" ? null : { path: `x/${type}.webp`, width: 1, height: 1 }),
    );

    const count = await attachOffImages("product-1", "ASIA-00001", {
      front: "https://off.example/front.jpg",
      ingredients: "https://off.example/ingredients.jpg",
    });

    expect(count).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].data.type).toBe("ingredients");
  });

  it("returns 0 and creates nothing when no URLs are provided", async () => {
    const count = await attachOffImages("product-1", "ASIA-00001", {});
    expect(count).toBe(0);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
