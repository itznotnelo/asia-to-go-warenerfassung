import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ readFile: (...args: unknown[]) => readFileMock(...args) }));

const productImageMock = { findMany: vi.fn(), update: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { productImage: productImageMock } }));

const uploadImageToBackendMock = vi.fn();
vi.mock("./client", () => ({ uploadImageToBackend: uploadImageToBackendMock }));

const { pushPendingImages } = await import("./image-push");

const settings = { apiUrl: "https://atg-shop.example.workers.dev", deviceId: "shop-pc", deviceKey: "secret-key" };

function imageRow(overrides: Record<string, unknown> = {}) {
  return { id: "img_1", productId: "prod_1", type: "front", path: "ASIA-00001/front.webp", ...overrides };
}

beforeEach(() => {
  readFileMock.mockReset();
  productImageMock.findMany.mockReset();
  productImageMock.update.mockReset().mockResolvedValue({});
  uploadImageToBackendMock.mockReset();
});

describe("pushPendingImages", () => {
  it("skips the network call entirely when settings are incomplete", async () => {
    const result = await pushPendingImages({ apiUrl: "", deviceId: "", deviceKey: "" });

    expect(result).toEqual([]);
    expect(productImageMock.findMany).not.toHaveBeenCalled();
  });

  it("only looks up images with no r2Key yet", async () => {
    productImageMock.findMany.mockResolvedValue([]);

    await pushPendingImages(settings);

    expect(productImageMock.findMany).toHaveBeenCalledWith({ where: { r2Key: null } });
  });

  it("uploads each pending image, stores the returned r2Key, and returns the touched product ids", async () => {
    productImageMock.findMany.mockResolvedValue([imageRow()]);
    readFileMock.mockResolvedValue(Buffer.from("fake-bytes"));
    uploadImageToBackendMock.mockResolvedValue("products/prod_1/front-123.jpg");

    const result = await pushPendingImages(settings);

    expect(result).toEqual(["prod_1"]);
    expect(uploadImageToBackendMock).toHaveBeenCalledWith(settings, "prod_1", "front", Buffer.from("fake-bytes"), "image/webp");
    expect(productImageMock.update).toHaveBeenCalledWith({
      where: { id: "img_1" },
      data: { r2Key: "products/prod_1/front-123.jpg" },
    });
  });

  it("keeps going when one image's upload fails, instead of throwing", async () => {
    productImageMock.findMany.mockResolvedValue([imageRow({ id: "img_1", productId: "prod_1" }), imageRow({ id: "img_2", productId: "prod_2" })]);
    readFileMock.mockResolvedValue(Buffer.from("fake-bytes"));
    uploadImageToBackendMock.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce("products/prod_2/front-9.jpg");

    const result = await pushPendingImages(settings);

    expect(result).toEqual(["prod_2"]);
    expect(productImageMock.update).toHaveBeenCalledTimes(1);
  });

  it("picks the content type from the file extension", async () => {
    productImageMock.findMany.mockResolvedValue([imageRow({ path: "ASIA-00002/front.jpg" })]);
    readFileMock.mockResolvedValue(Buffer.from("x"));
    uploadImageToBackendMock.mockResolvedValue("r2/key.jpg");

    await pushPendingImages(settings);

    expect(uploadImageToBackendMock).toHaveBeenCalledWith(settings, "prod_1", "front", expect.anything(), "image/jpeg");
  });
});
