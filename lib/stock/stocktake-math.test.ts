import { describe, expect, it } from "vitest";
import { correctionFor, stockAfterCount, stocktakeDiff, type CountedLine } from "./stocktake-math";

const line = (productId: string, countedQty: number, expectedQty: number, cost: number | null = 100): CountedLine => ({
  productId,
  countedQty,
  expectedQty,
  unitType: "piece",
  purchasePriceRappen: cost,
});

describe("stocktake diff", () => {
  it("books counted minus expected-at-count, applied to the stock at booking time", () => {
    expect(correctionFor({ countedQty: 8, expectedQty: 10 })).toBe(-2);
    // Counted 8 of expected 10, then 3 sold before booking: stock 7 -> 5, not 8.
    expect(stockAfterCount(7, { countedQty: 8, expectedQty: 10 })).toBe(5);
  });
  it("sums plus and minus values at EK and counts lines without EK", () => {
    const summary = stocktakeDiff([line("a", 12, 10, 150), line("b", 5, 8, 200), line("c", 3, 3), line("d", 1, 0, null)]);
    expect(summary.counted).toBe(4);
    expect(summary.changed).toBe(3);
    expect(summary.plusValueRappen).toBe(300);
    expect(summary.minusValueRappen).toBe(-600);
    expect(summary.withoutCost).toBe(1);
  });
  it("lists changed lines first, biggest value first", () => {
    const summary = stocktakeDiff([line("same", 3, 3), line("small", 4, 3, 10), line("big", 0, 5, 500)]);
    expect(summary.lines.map((l) => l.productId)).toEqual(["big", "small", "same"]);
  });
});
