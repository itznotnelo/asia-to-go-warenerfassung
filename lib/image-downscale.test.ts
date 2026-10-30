import { describe, expect, it } from "vitest";
import { downscaleImage, fitWithin, UPLOAD_MAX_EDGE } from "./image-downscale";

describe("fitWithin", () => {
  it("scales a 4000x3000 phone photo to the max edge, keeping the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: UPLOAD_MAX_EDGE, height: 1200 });
  });

  it("scales portrait photos by their height", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: UPLOAD_MAX_EDGE });
  });

  it("leaves images at or below the max edge alone", () => {
    expect(fitWithin(1600, 900)).toBeNull();
    expect(fitWithin(800, 600)).toBeNull();
  });

  it("never returns a zero-sized side for extreme panoramas", () => {
    expect(fitWithin(100_000, 10)).toEqual({ width: UPLOAD_MAX_EDGE, height: 1 });
  });

  it("returns null for unusable dimensions", () => {
    expect(fitWithin(0, 100)).toBeNull();
    expect(fitWithin(Number.NaN, 100)).toBeNull();
  });
});

describe("downscaleImage", () => {
  it("returns the original file where there is no canvas (server, tests)", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
    await expect(downscaleImage(file)).resolves.toBe(file);
  });
});
