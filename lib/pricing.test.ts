import { describe, expect, it } from "vitest";
import {
  calcUnitPrice,
  formatChf,
  parseChfToRappen,
  parseContentAmount,
  roundTo5,
  vatBreakdown,
  vatRappen,
} from "@/lib/pricing";

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

describe("vatBreakdown", () => {
  it("sums gross per rate before rounding (10 x 99 Rp. at 2.6 % is 25, not 10 x 3)", () => {
    const lines = Array.from({ length: 10 }, () => ({ grossRappen: 99, vatRate: 2.6 }));
    expect(lines.reduce((sum, line) => sum + vatRappen(line.grossRappen, line.vatRate), 0)).toBe(30);
    expect(vatBreakdown(lines)).toEqual([{ vatRate: 2.6, grossRappen: 990, netRappen: 965, vatRappen: 25 }]);
  });

  it("returns one row per rate, sorted 2.6 then 8.1, and net + vat = gross", () => {
    const rows = vatBreakdown([
      { grossRappen: 1000, vatRate: 8.1 },
      { grossRappen: 495, vatRate: 2.6 },
      { grossRappen: 1290, vatRate: 2.6 },
      { grossRappen: 350, vatRate: 8.1 },
    ]);
    expect(rows).toEqual([
      { vatRate: 2.6, grossRappen: 1785, netRappen: 1740, vatRappen: 45 },
      { vatRate: 8.1, grossRappen: 1350, netRappen: 1249, vatRappen: 101 },
    ]);
    for (const row of rows) expect(row.netRappen + row.vatRappen).toBe(row.grossRappen);
  });

  it("matches vatRappen for a single line", () => {
    expect(vatBreakdown([{ grossRappen: 1000, vatRate: 2.6 }])[0].vatRappen).toBe(vatRappen(1000, 2.6));
    expect(vatBreakdown([{ grossRappen: 1000, vatRate: 8.1 }])[0].vatRappen).toBe(vatRappen(1000, 8.1));
  });

  it("is empty for no lines", () => {
    expect(vatBreakdown([])).toEqual([]);
  });

  it("refuses unknown rates and non-integer Rappen instead of printing a wrong receipt", () => {
    expect(() => vatBreakdown([{ grossRappen: 1000, vatRate: 7.7 }])).toThrow(RangeError);
    expect(() => vatBreakdown([{ grossRappen: 10.5, vatRate: 2.6 }])).toThrow(RangeError);
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

describe("parseChfToRappen", () => {
  it.each([
    ["4.20", 420],
    ["4,5", 450],
    ["4", 400],
    ["4.-", 400],
    ["1'250.00", 125000],
    ["1’250.00", 125000],
    ["1 250.00", 125000],
    ["1 250", 125000],
    ["  12.90 ", 1290],
    ["0.05", 5],
  ])("parses %s as %i rappen", (input, expected) => {
    expect(parseChfToRappen(input)).toBe(expected);
  });

  it.each(["", "abc", "3 50", "4.20.", "12.999", "-4.20", "4.2.0", "1e3", "CHF 4.20"])(
    "rejects %s",
    (input) => {
      expect(parseChfToRappen(input)).toBeNull();
    },
  );
});

describe("parseContentAmount", () => {
  it.each([
    ["500", 500],
    ["1'000", 1000],
    ["0,5", 0.5],
    ["1.125", 1.125],
  ])("parses %s as %d", (input, expected) => {
    expect(parseContentAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "1.2345", "1,000.5", "-5"])("rejects %s", (input) => {
    expect(parseContentAmount(input)).toBeNull();
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
