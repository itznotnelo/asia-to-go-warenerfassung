import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
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

const { downloadAndStoreImage } = await import("./images");

function imageResponse(ok = true, status = ok ? 200 : 500) {
  return { ok, status, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
}

beforeEach(() => {
  mkdirMock.mockReset().mockResolvedValue(undefined);
  writeFileMock.mockReset().mockResolvedValue(undefined);
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
