import { describe, expect, it } from "vitest";
import { calcUnitPrice, formatChf, roundTo5, vatRappen } from "@/lib/pricing";

describe("calcUnitPrice", () => {
  it("normalizes grams to CHF/kg", () => {
    expect(calcUnitPrice(420, 500, "g")).toEqual({ valueRappen: 840, unit: "kg" });
  });

  it("keeps kg as CHF/kg", () => {
    expect(calcUnitPrice(1000, 2, "kg")).toEqual({ valueRappen: 500, unit: "kg" });
  });

  it("normalizes ml to CHF/l", () => {
    expect(calcUnitPrice(250, 500, "ml")).toEqual({ valueRappen: 500, unit: "l" });
  });

  it("keeps l as CHF/l", () => {
    expect(calcUnitPrice(300, 1.5, "l")).toEqual({ valueRappen: 200, unit: "l" });
  });

  it("returns null for piece goods", () => {
    expect(calcUnitPrice(100, 1, "stk")).toBeNull();
  });

  it("returns null when content amount is missing", () => {
    expect(calcUnitPrice(100, null, "g")).toBeNull();
    expect(calcUnitPrice(100, undefined, "g")).toBeNull();
  });

  it("returns null when content unit is missing", () => {
    expect(calcUnitPrice(100, 500, null)).toBeNull();
  });

  it("returns null for zero or negative amounts", () => {
    expect(calcUnitPrice(100, 0, "g")).toBeNull();
    expect(calcUnitPrice(100, -50, "g")).toBeNull();
  });
});

describe("vatRappen", () => {
  it("extracts the reduced 2.6% rate from a gross price", () => {
    expect(vatRappen(1000, 2.6)).toBe(25);
  });

  it("extracts the standard 8.1% rate from a gross price", () => {
    expect(vatRappen(1000, 8.1)).toBe(75);
  });

  it("is zero for a zero-rate price", () => {
    expect(vatRappen(1000, 0)).toBe(0);
  });
});

describe("roundTo5", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 5],
    [4, 5],
    [5, 5],
    [7, 5],
    [8, 10],
    [423, 425],
    [422, 420],
  ])("rounds %i rappen to %i", (input, expected) => {
    expect(roundTo5(input)).toBe(expected);
  });
});

describe("formatChf", () => {
  it("formats a small amount", () => {
    expect(formatChf(420)).toBe("CHF 4.20");
  });

  it("adds a thousands separator", () => {
    expect(formatChf(125000)).toBe("CHF 1'250.00");
  });

  it("pads a single decimal digit", () => {
    expect(formatChf(100)).toBe("CHF 1.00");
  });

  it("handles negative amounts", () => {
    expect(formatChf(-420)).toBe("-CHF 4.20");
  });

  it("handles zero", () => {
    expect(formatChf(0)).toBe("CHF 0.00");
  });
});
