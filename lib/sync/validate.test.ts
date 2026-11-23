import { describe, expect, it } from "vitest";
import { apiUrlSchema, isAllowedApiUrl, parseUploadResponse, shopSyncSettingsInputSchema } from "./validate";

describe("isAllowedApiUrl", () => {
  it("accepts https backends", () => {
    expect(isAllowedApiUrl("https://api.asia-2go.ch")).toBe(true);
    expect(isAllowedApiUrl("https://atg-shop-backend.example.workers.dev/v1")).toBe(true);
  });

  it("accepts http only for a local dev backend", () => {
    expect(isAllowedApiUrl("http://localhost:8787")).toBe(true);
    expect(isAllowedApiUrl("http://127.0.0.1:8787")).toBe(true);
    expect(isAllowedApiUrl("http://asia-2go.ch")).toBe(false);
    expect(isAllowedApiUrl("http://192.168.1.10:8787")).toBe(false);
  });

  it("rejects other schemes, credentials in the URL and junk", () => {
    expect(isAllowedApiUrl("ftp://asia-2go.ch")).toBe(false);
    expect(isAllowedApiUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedApiUrl("https://user:pw@asia-2go.ch")).toBe(false);
    expect(isAllowedApiUrl("asia-2go.ch")).toBe(false);
    expect(isAllowedApiUrl("")).toBe(false);
  });
});

describe("apiUrlSchema", () => {
  it("allows an empty value (sync off) and trims", () => {
    expect(apiUrlSchema.parse("")).toBe("");
    expect(apiUrlSchema.parse("  https://api.asia-2go.ch  ")).toBe("https://api.asia-2go.ch");
  });

  it("rejects http and overlong URLs with a German message", () => {
    const http = apiUrlSchema.safeParse("http://asia-2go.ch");
    expect(http.success).toBe(false);
    expect(http.error?.issues[0]?.message).toBe("Nur https-Adressen erlaubt");
    const long = apiUrlSchema.safeParse(`https://a.ch/${"x".repeat(200)}`);
    expect(long.success).toBe(false);
  });
});

describe("shopSyncSettingsInputSchema", () => {
  it("accepts a normal settings form", () => {
    expect(
      shopSyncSettingsInputSchema.parse({ apiUrl: "https://api.asia-2go.ch", deviceId: "laden-1", deviceKey: "k".repeat(64) }),
    ).toEqual({ apiUrl: "https://api.asia-2go.ch", deviceId: "laden-1", deviceKey: "k".repeat(64) });
  });

  it("caps deviceId and deviceKey length", () => {
    expect(shopSyncSettingsInputSchema.safeParse({ apiUrl: "", deviceId: "x".repeat(101), deviceKey: "" }).success).toBe(
      false,
    );
    expect(shopSyncSettingsInputSchema.safeParse({ apiUrl: "", deviceId: "", deviceKey: "k".repeat(201) }).success).toBe(
      false,
    );
  });
});

describe("parseUploadResponse", () => {
  const productId = "cmb1x2y3z0000abcd";

  it("returns the key the backend builds", () => {
    const r2Key = `products/${productId}/front-1761782400000.jpg`;
    expect(parseUploadResponse({ r2Key }, productId)).toBe(r2Key);
  });

  it("rejects a missing or non-string r2Key", () => {
    expect(() => parseUploadResponse({}, productId)).toThrow("invalid response");
    expect(() => parseUploadResponse(null, productId)).toThrow("invalid response");
    expect(() => parseUploadResponse({ r2Key: 42 }, productId)).toThrow("invalid response");
  });

  it("rejects keys outside products/<id>/<file>", () => {
    for (const r2Key of [
      `products/${productId}/../../secrets.txt`,
      `products/${productId}/..`,
      `products/${productId}/a/b.jpg`,
      `https://evil.example/x.jpg`,
      `/products/${productId}/front.jpg`,
      `products/${productId}/front.jpg?x=1`,
      `products/${productId}/front 1.jpg`,
      `products/${productId}/${"a".repeat(300)}.jpg`,
      `other/${productId}/front.jpg`,
    ]) {
      expect(() => parseUploadResponse({ r2Key }, productId), r2Key).toThrow("invalid response");
    }
  });

  it("rejects a valid-looking key for another product", () => {
    expect(() => parseUploadResponse({ r2Key: "products/someoneelse/front-1.jpg" }, productId)).toThrow(
      "another product",
    );
  });
});
