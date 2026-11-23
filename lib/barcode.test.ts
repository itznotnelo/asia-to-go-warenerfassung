import { describe, expect, it } from "vitest";
import { hasValidBarcodeFormat, hasValidCheckDigit, isValidBarcode, normalizeGtin } from "./barcode";

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

  it("validates every GTIN length", () => {
    expect(isValidBarcode("96385074")).toBe(true);
    expect(isValidBarcode("012345678905")).toBe(true);
    expect(isValidBarcode("0012345678905")).toBe(true);
    expect(isValidBarcode("00012345678905")).toBe(true);
    expect(isValidBarcode("10012345678902")).toBe(true);
    expect(isValidBarcode("10012345678903")).toBe(false);
  });

  it("validates Swiss GS1 codes (prefix 76)", () => {
    expect(isValidBarcode("7610097111072")).toBe(true);
    expect(isValidBarcode("7614500010013")).toBe(true);
    expect(isValidBarcode("7610097111073")).toBe(false);
  });

  it("returns false for null, undefined and empty input", () => {
    expect(isValidBarcode(null)).toBe(false);
    expect(isValidBarcode(undefined)).toBe(false);
    expect(isValidBarcode("")).toBe(false);
  });

  // The five seed EANs that shipped with a wrong check digit (#3070), and their fix.
  it.each([
    ["8850329654127", "8850329654123"],
    ["8801043017135", "8801043017138"],
    ["8801007500128", "8801007500126"],
    ["4710114128254", "4710114128250"],
    ["6970399820133", "6970399820135"],
  ])("rejects old seed EAN %s, accepts fixed %s", (broken, fixed) => {
    expect(isValidBarcode(broken)).toBe(false);
    expect(isValidBarcode(fixed)).toBe(true);
  });
});

describe("normalizeGtin", () => {
  it("pads UPC-A to EAN-13", () => {
    expect(normalizeGtin("012345678905")).toBe("0012345678905");
    expect(normalizeGtin("036000291452")).toBe("0036000291452");
  });

  it("maps UPC-A and its EAN-13 form to the same value", () => {
    expect(normalizeGtin("012345678905")).toBe(normalizeGtin("0012345678905"));
  });

  it("drops indicator 0 from a GTIN-14", () => {
    expect(normalizeGtin("00012345678905")).toBe("0012345678905");
  });

  it("keeps a GTIN-14 with a non-zero indicator", () => {
    expect(normalizeGtin("10012345678902")).toBe("10012345678902");
  });

  it("keeps EAN-8 and EAN-13 unchanged", () => {
    expect(normalizeGtin("96385074")).toBe("96385074");
    expect(normalizeGtin("7610097111072")).toBe("7610097111072");
  });

  it("trims scanner whitespace", () => {
    expect(normalizeGtin(" 7610097111072\n")).toBe("7610097111072");
  });

  it("keeps a valid code valid", () => {
    expect(isValidBarcode(normalizeGtin("012345678905"))).toBe(true);
    expect(isValidBarcode(normalizeGtin("00012345678905"))).toBe(true);
  });

  it("returns null for empty or impossible input", () => {
    expect(normalizeGtin(null)).toBeNull();
    expect(normalizeGtin(undefined)).toBeNull();
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin("   ")).toBeNull();
    expect(normalizeGtin("1234567")).toBeNull();
    expect(normalizeGtin("123456789")).toBeNull();
    expect(normalizeGtin("30176204a2003")).toBeNull();
  });
});
