import { describe, expect, it } from "vitest";
import { isDeadStock, isLowStock, isNegativeStock, stockValue } from "./overview-math";

describe("stockValue", () => {
  it("adds positive stock at EK and counts articles without EK", () => {
    expect(
      stockValue([
        { unitType: "piece", stockQty: 10, purchasePriceRappen: 120 },
        { unitType: "weight", stockQty: 2500, purchasePriceRappen: 400 },
        { unitType: "piece", stockQty: -5, purchasePriceRappen: 999 },
        { unitType: "piece", stockQty: 3, purchasePriceRappen: null },
      ]),
    ).toEqual({ valueRappen: 1200 + 1000, withoutCost: 1 });
  });
});

describe("flags", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  it("marks dead stock after 60 days without any movement", () => {
    expect(isDeadStock({ stockQty: 5, lastMovementAt: new Date("2026-09-24T12:00:00Z") }, now)).toBe(true);
    expect(isDeadStock({ stockQty: 5, lastMovementAt: new Date("2026-09-25T12:00:00Z") }, now)).toBe(false);
    expect(isDeadStock({ stockQty: 0, lastMovementAt: null }, now)).toBe(false);
  });
  it("separates low from negative stock", () => {
    expect(isLowStock({ stockQty: 2, minStock: 3 })).toBe(true);
    expect(isLowStock({ stockQty: -1, minStock: 3 })).toBe(false);
    expect(isLowStock({ stockQty: 2, minStock: null })).toBe(false);
    expect(isNegativeStock({ stockQty: -1 })).toBe(true);
  });
});
