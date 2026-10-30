import { describe, expect, it } from "vitest";
import { isGracePeriodOver, SHOP_DELETE_GRACE_MINUTES, SHOP_DELETE_GRACE_MS, shopDeleteDueAt } from "./archive-grace";

const ARCHIVED = new Date("2026-10-30T16:00:00.000Z");

describe("archive grace period (review should #34)", () => {
  it("is a few minutes, not seconds and not days", () => {
    expect(SHOP_DELETE_GRACE_MINUTES).toBe(SHOP_DELETE_GRACE_MS / 60_000);
    expect(SHOP_DELETE_GRACE_MINUTES).toBeGreaterThanOrEqual(1);
    expect(SHOP_DELETE_GRACE_MINUTES).toBeLessThanOrEqual(60);
  });

  it("puts the shop delete exactly one grace period after archiving", () => {
    expect(shopDeleteDueAt(ARCHIVED).getTime() - ARCHIVED.getTime()).toBe(SHOP_DELETE_GRACE_MS);
  });

  it("is over at the due time, not a millisecond before", () => {
    const due = shopDeleteDueAt(ARCHIVED);
    expect(isGracePeriodOver(ARCHIVED, new Date(due.getTime() - 1))).toBe(false);
    expect(isGracePeriodOver(ARCHIVED, due)).toBe(true);
    expect(isGracePeriodOver(ARCHIVED, new Date(due.getTime() + 60_000))).toBe(true);
  });
});
