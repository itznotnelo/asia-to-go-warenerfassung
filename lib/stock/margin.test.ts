import { describe, expect, it } from "vitest";
import { computeMargin, formatBasisPoints } from "./margin";

describe("computeMargin", () => {
  it("compares EK with the VK minus its MwSt, all in Rappen", () => {
    // VK 2.95 at 2.6 %: MwSt 7 Rp, net 288; EK 180 -> margin 108 = 37.5 %.
    const margin = computeMargin({ priceRappen: 295, vatRate: 2.6, unitType: "piece", contentAmount: null, contentUnit: null, purchasePriceRappen: 180 });
    expect(margin).toEqual({ netSalesRappen: 288, costRappen: 180, marginRappen: 108, marginBasisPoints: 3750 });
    expect(formatBasisPoints(margin!.marginBasisPoints)).toBe("37.5 %");
  });
  it("compares loose goods per kg via the Grundpreis", () => {
    // 3.90 per 500 g = 7.80 per kg gross.
    const margin = computeMargin({ priceRappen: 390, vatRate: 2.6, unitType: "weight", contentAmount: 500, contentUnit: "g", purchasePriceRappen: 500 });
    expect(margin?.netSalesRappen).toBe(780 - 20);
  });
  it("is null without EK and shows a loss as negative", () => {
    expect(computeMargin({ priceRappen: 295, vatRate: 2.6, unitType: "piece", contentAmount: null, contentUnit: null, purchasePriceRappen: null })).toBeNull();
    const loss = computeMargin({ priceRappen: 100, vatRate: 8.1, unitType: "piece", contentAmount: null, contentUnit: null, purchasePriceRappen: 120 });
    expect(loss!.marginRappen).toBeLessThan(0);
    expect(formatBasisPoints(loss!.marginBasisPoints)).toMatch(/^-/);
  });
});
