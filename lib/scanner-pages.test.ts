import { describe, expect, it } from "vitest";
import { pageHasOwnScanner } from "./scanner-pages";

describe("pageHasOwnScanner", () => {
  it("covers the scan page and the stock scan modes only", () => {
    expect(pageHasOwnScanner("/scan")).toBe(true);
    expect(pageHasOwnScanner("/stock/sale")).toBe(true);
    expect(pageHasOwnScanner("/stock/receipts/abc123")).toBe(true);
    expect(pageHasOwnScanner("/stock/counts/abc123")).toBe(true);
    expect(pageHasOwnScanner("/stock/receipts")).toBe(false);
    expect(pageHasOwnScanner("/stock")).toBe(false);
    expect(pageHasOwnScanner("/products/abc")).toBe(false);
  });
});

describe("safeReturnPath", () => {
  it("only allows the stock scan modes", async () => {
    const { safeReturnPath } = await import("./scanner-pages");
    expect(safeReturnPath("/stock/receipts/ckabc123")).toBe("/stock/receipts/ckabc123");
    expect(safeReturnPath("/stock/counts/ckabc123")).toBe("/stock/counts/ckabc123");
    expect(safeReturnPath("/stock/sale")).toBe("/stock/sale");
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("/stock/receipts/../../settings")).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});
