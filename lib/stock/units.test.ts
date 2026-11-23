import { describe, expect, it } from "vitest";
import { formatPacks, formatStockQty, formatStockQtyPlain, packsToQty, parseQtyInput, qtyToInput, valueRappen } from "./units";

describe("formatStockQty", () => {
  it("shows pieces with thousands apostrophes and keeps the sign", () => {
    expect(formatStockQty(12, "piece")).toBe("12 Stk");
    expect(formatStockQty(1250, "piece")).toBe("1'250 Stk");
    expect(formatStockQty(-3, "piece")).toBe("-3 Stk");
  });
  it("shows loose goods in g/ml below 1000 and kg/l above", () => {
    expect(formatStockQty(750, "weight")).toBe("750 g");
    expect(formatStockQty(1250, "weight")).toBe("1.25 kg");
    expect(formatStockQty(2000, "volume")).toBe("2 l");
    expect(formatStockQty(-1500, "weight")).toBe("-1.5 kg");
  });
  it("refuses non-integers", () => {
    expect(() => formatStockQty(1.5, "piece")).toThrow();
  });
});

describe("parseQtyInput", () => {
  it("accepts whole pieces only", () => {
    expect(parseQtyInput("24", "piece")).toBe(24);
    expect(parseQtyInput(" 1'200 ", "piece")).toBe(1200);
    expect(parseQtyInput("2.5", "piece")).toBeNull();
    expect(parseQtyInput("abc", "piece")).toBeNull();
    expect(parseQtyInput("", "piece")).toBeNull();
  });
  it("reads kg / l with comma or point into g / ml without float errors", () => {
    expect(parseQtyInput("2,5", "weight")).toBe(2500);
    expect(parseQtyInput("0.125", "weight")).toBe(125);
    expect(parseQtyInput("1.1", "volume")).toBe(1100);
    expect(parseQtyInput("0.0001", "weight")).toBeNull();
  });
  it("allows a minus only when asked", () => {
    expect(parseQtyInput("-3", "piece")).toBeNull();
    expect(parseQtyInput("-3", "piece", true)).toBe(-3);
  });
  it("round-trips through qtyToInput", () => {
    expect(qtyToInput(2500, "weight")).toBe("2.5");
    expect(qtyToInput(2000, "weight")).toBe("2");
    expect(qtyToInput(7, "piece")).toBe("7");
    expect(parseQtyInput(qtyToInput(1234, "volume"), "volume")).toBe(1234);
  });
});

describe("valueRappen (money in Rappen)", () => {
  it("multiplies pieces by EK per piece", () => {
    expect(valueRappen(24, "piece", 95)).toBe(2280);
  });
  it("values grams at EK per kg, rounded once to whole Rappen", () => {
    expect(valueRappen(2500, "weight", 380)).toBe(950);
    expect(valueRappen(333, "weight", 100)).toBe(33);
    expect(valueRappen(1, "volume", 499)).toBe(0);
  });
  it("refuses float money", () => {
    expect(() => valueRappen(1, "piece", 1.5)).toThrow();
  });
});

describe("pack size conversion", () => {
  it("turns cartons into pieces", () => {
    expect(packsToQty(3, 24)).toBe(72);
    expect(packsToQty(5, 1)).toBe(5);
  });
  it("rejects a pack size below 1", () => {
    expect(() => packsToQty(3, 0)).toThrow();
    expect(() => packsToQty(1.5, 24)).toThrow();
  });
  it("describes quantities in cartons plus loose pieces", () => {
    expect(formatPacks(72, 24, "piece")).toBe("3 Karton à 24 Stk");
    expect(formatPacks(53, 24, "piece")).toBe("2 Karton à 24 Stk + 5 Stk");
    expect(formatPacks(5, 24, "piece")).toBe("5 Stk");
    expect(formatPacks(6, 1, "piece")).toBe("6 Stk");
  });
  it("exports plain numbers for Excel", () => {
    expect(formatStockQtyPlain(1250, "weight")).toBe("1.250");
    expect(formatStockQtyPlain(-50, "weight")).toBe("-0.050");
    expect(formatStockQtyPlain(12, "piece")).toBe("12");
  });
});
