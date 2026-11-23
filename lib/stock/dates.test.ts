import { describe, expect, it } from "vitest";
import { daysUntil, endOfShopDay, formatDateOnly, parseDateOnly, shopToday } from "./dates";

describe("date-only helpers", () => {
  it("parses only real calendar dates", () => {
    expect(parseDateOnly("2026-12-31")?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("31.12.2026")).toBeNull();
  });
  it("uses the Zurich day, not the UTC day", () => {
    // 23:30 UTC on 31.12. is already 1.1. in Zurich.
    expect(shopToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
  it("counts days until an MHD from the shop's today", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(daysUntil(parseDateOnly("2026-11-23")!, now)).toBe(0);
    expect(daysUntil(parseDateOnly("2026-11-30")!, now)).toBe(7);
    expect(daysUntil(parseDateOnly("2026-11-20")!, now)).toBe(-3);
  });
  it("formats Swiss style", () => {
    expect(formatDateOnly(parseDateOnly("2026-03-05")!)).toBe("05.03.2026");
  });
  it("ends a shop day at Zurich midnight in winter and summer", () => {
    expect(endOfShopDay("2026-12-31")?.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(endOfShopDay("2026-07-15")?.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    expect(endOfShopDay("nope")).toBeNull();
  });
});
