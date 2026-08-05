import { describe, expect, it } from "vitest";
import { hasValidBarcodeFormat, hasValidCheckDigit, isValidBarcode } from "./barcode";

describe("hasValidBarcodeFormat", () => {
  it("accepts 8, 12, 13 and 14 digit codes", () => {
    expect(hasValidBarcodeFormat("12345670")).toBe(true);
    expect(hasValidBarcodeFormat("036000291452")).toBe(true);
    expect(hasValidBarcodeFormat("3017620422003")).toBe(true);
    expect(hasValidBarcodeFormat("10036000291452")).toBe(true);
  });

  it("rejects other lengths and non-digit characters", () => {
    expect(hasValidBarcodeFormat("1234567")).toBe(false);
    expect(hasValidBarcodeFormat("123456789")).toBe(false);
    expect(hasValidBarcodeFormat("30176204a2003")).toBe(false);
    expect(hasValidBarcodeFormat("")).toBe(false);
  });
});

describe("hasValidCheckDigit", () => {
  // Reale, bekannte Barcodes (u.a. via echtem OFF-Testabruf verifiziert beim
  // Bau des OFF-Clients) statt erfundener Beispiele.
  it("validates a real EAN-13 (Nutella)", () => {
    expect(hasValidCheckDigit("3017620422003")).toBe(true);
  });

  it("validates a real EAN-13 (Coca-Cola)", () => {
    expect(hasValidCheckDigit("5449000000996")).toBe(true);
  });

  it("validates the standard EAN-8 worked example", () => {
    expect(hasValidCheckDigit("12345670")).toBe(true);
  });

  it("validates a real UPC-A (12 digits)", () => {
    expect(hasValidCheckDigit("036000291452")).toBe(true);
  });

  it("rejects a corrupted check digit", () => {
    expect(hasValidCheckDigit("3017620422001")).toBe(false);
    expect(hasValidCheckDigit("12345671")).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    expect(hasValidCheckDigit("not-a-barcode")).toBe(false);
  });
});

describe("isValidBarcode", () => {
  it("requires both correct format and correct check digit", () => {
    expect(isValidBarcode("3017620422003")).toBe(true);
    expect(isValidBarcode("3017620422001")).toBe(false);
    expect(isValidBarcode("1234567")).toBe(false);
  });
});
