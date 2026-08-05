import { describe, expect, it } from "vitest";
import { parseQuantity } from "./quantity";

describe("parseQuantity", () => {
  it("parses grams", () => {
    expect(parseQuantity("500 g")).toEqual({ contentAmount: 500, contentUnit: "g" });
  });

  it("parses grams without a space", () => {
    expect(parseQuantity("500g")).toEqual({ contentAmount: 500, contentUnit: "g" });
  });

  it("parses kilograms", () => {
    expect(parseQuantity("5 kg")).toEqual({ contentAmount: 5, contentUnit: "kg" });
  });

  it("parses litres regardless of case", () => {
    expect(parseQuantity("1L")).toEqual({ contentAmount: 1, contentUnit: "l" });
  });

  it("parses millilitres", () => {
    expect(parseQuantity("250 ml")).toEqual({ contentAmount: 250, contentUnit: "ml" });
  });

  it("converts centilitres to millilitres", () => {
    expect(parseQuantity("33 cl")).toEqual({ contentAmount: 330, contentUnit: "ml" });
  });

  it("accepts a decimal comma", () => {
    expect(parseQuantity("1,5 l")).toEqual({ contentAmount: 1.5, contentUnit: "l" });
  });

  it("rejects multipacks instead of guessing total vs. per-unit", () => {
    expect(parseQuantity("2 x 100g")).toBeNull();
    expect(parseQuantity("2x100g")).toBeNull();
  });

  it("rejects unparseable text", () => {
    expect(parseQuantity("etwa eine Handvoll")).toBeNull();
  });

  it("rejects an unknown unit", () => {
    expect(parseQuantity("3 Stk")).toBeNull();
  });

  it("handles empty and undefined input", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
  });

  it("rejects zero and negative amounts", () => {
    expect(parseQuantity("0 g")).toBeNull();
    expect(parseQuantity("-5 g")).toBeNull();
  });
});
