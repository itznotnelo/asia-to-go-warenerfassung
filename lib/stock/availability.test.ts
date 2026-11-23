import { describe, expect, it } from "vitest";
import { derivedAvailability, parseSafetyBuffer } from "./availability";

describe("derivedAvailability", () => {
  it("keeps the manual flag for articles without stock tracking", () => {
    expect(derivedAvailability(null, true, 1)).toBe(true);
    expect(derivedAvailability(null, false, 1)).toBe(false);
  });
  it("uses stock above the safety buffer for tracked articles, ignoring the flag", () => {
    expect(derivedAvailability(2, false, 1)).toBe(true);
    expect(derivedAvailability(1, true, 1)).toBe(false);
    expect(derivedAvailability(0, true, 0)).toBe(false);
    expect(derivedAvailability(1, true, 0)).toBe(true);
    expect(derivedAvailability(-2, true, 0)).toBe(false);
  });
});

describe("parseSafetyBuffer", () => {
  it("accepts whole numbers 0..9999 only", () => {
    expect(parseSafetyBuffer("0")).toBe(0);
    expect(parseSafetyBuffer(" 3 ")).toBe(3);
    expect(parseSafetyBuffer("-1")).toBeNull();
    expect(parseSafetyBuffer("1.5")).toBeNull();
    expect(parseSafetyBuffer("10000")).toBeNull();
  });
});
