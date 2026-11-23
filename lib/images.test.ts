import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const rmMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  rm: (...args: unknown[]) => rmMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

const sharpChain = {
  rotate: vi.fn(),
  resize: vi.fn(),
  webp: vi.fn(),
  toBuffer: vi.fn(),
  metadata: vi.fn(),
};
sharpChain.rotate.mockReturnValue(sharpChain);
sharpChain.resize.mockReturnValue(sharpChain);
sharpChain.webp.mockReturnValue(sharpChain);
sharpChain.toBuffer.mockResolvedValue(Buffer.from("fake-webp-bytes"));
sharpChain.metadata.mockResolvedValue({ width: 800, height: 600 });

vi.mock("sharp", () => ({ default: vi.fn(() => sharpChain) }));

const { downloadAndStoreImage, removeProductImageDir, removeStoredImage, storeUploadedImage } = await import("./images");

function imageResponse(ok = true, status = ok ? 200 : 500) {
  return { ok, status, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
}

beforeEach(() => {
  mkdirMock.mockReset().mockResolvedValue(undefined);
  writeFileMock.mockReset().mockResolvedValue(undefined);
  rmMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadAndStoreImage", () => {
  it("downloads, resizes and stores the image plus a thumbnail, returning path and dimensions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse()));

    const result = await downloadAndStoreImage("https://example.com/front.jpg", "ASIA-00001", "front");

    expect(result).toEqual({ path: "ASIA-00001/front.webp", width: 800, height: 600 });
    expect(mkdirMock).toHaveBeenCalledWith(expect.stringContaining("ASIA-00001"), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    expect(writeFileMock.mock.calls[0][0]).toContain("front.webp");
    expect(writeFileMock.mock.calls[1][0]).toContain("front-thumb.webp");
  });

  it("returns null on a non-ok HTTP response without touching disk", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(false, 404)));

    const result = await downloadAndStoreImage("https://example.com/missing.jpg", "ASIA-00001", "front");

    expect(result).toBeNull();
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("returns null on a network error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(downloadAndStoreImage("https://example.com/front.jpg", "ASIA-00001", "front")).resolves.toBeNull();
  });
});

describe("storeUploadedImage", () => {
  it("resizes and stores an uploaded buffer plus a thumbnail, returning path and dimensions", async () => {
    const result = await storeUploadedImage(Buffer.from("raw-upload-bytes"), "ASIA-00002", "other");

    // Every upload gets a file name of its own, so a retaken photo never overwrites an older one.
    expect(result?.path).toMatch(/^ASIA-00002\/other-[a-z0-9]+\.webp$/);
    expect(result).toMatchObject({ width: 800, height: 600 });
    expect(mkdirMock).toHaveBeenCalledWith(expect.stringContaining("ASIA-00002"), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    const stem = (result?.path ?? "").replace("ASIA-00002/", "").replace(".webp", "");
    expect(writeFileMock.mock.calls[0][0]).toContain(`${stem}.webp`);
    expect(writeFileMock.mock.calls[1][0]).toContain(`${stem}-thumb.webp`);
  });

  it("stores two uploads of the same type under different names", async () => {
    const first = await storeUploadedImage(Buffer.from("a"), "ASIA-00002", "front");
    const second = await storeUploadedImage(Buffer.from("b"), "ASIA-00002", "front");
    expect(first?.path).not.toBe(second?.path);
  });

  it("returns null instead of throwing when processing fails", async () => {
    writeFileMock.mockReset().mockRejectedValue(new Error("disk full"));

    await expect(storeUploadedImage(Buffer.from("x"), "ASIA-00002", "front")).resolves.toBeNull();
  });
});

describe("removeProductImageDir", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("removes the product's own image folder recursively", async () => {
    await removeProductImageDir("ASIA-00042");

    expect(rmMock).toHaveBeenCalledTimes(1);
    expect(rmMock.mock.calls[0][0]).toMatch(/[\\/]ASIA-00042$/);
    expect(rmMock.mock.calls[0][1]).toEqual({ recursive: true, force: true });
  });

  it.each(["", ".", "..", "../data", "ASIA-00042/../..", "a/b"])("refuses anything but one folder under the image root: %j", async (sku) => {
    await removeProductImageDir(sku);
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("only logs when the folder cannot be removed", async () => {
    rmMock.mockRejectedValue(new Error("EBUSY"));
    await expect(removeProductImageDir("ASIA-00042")).resolves.toBeUndefined();
  });
});

describe("removeStoredImage", () => {
  it("removes the image and its thumbnail", async () => {
    await removeStoredImage("ASIA-00042/front-abc123.webp");
    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(rmMock.mock.calls[0][0]).toContain("front-abc123.webp");
    expect(rmMock.mock.calls[1][0]).toContain("front-abc123-thumb.webp");
  });

  it("refuses paths outside one article folder", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of ["../secrets.webp", "ASIA-00042/../../x.webp", "front.webp", "ASIA-00042/a/b.webp", "ASIA-00042/notes.txt", ""]) {
      await removeStoredImage(bad);
    }
    expect(rmMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
