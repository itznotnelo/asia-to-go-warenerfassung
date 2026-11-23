import { describe, expect, it } from "vitest";
import { allocateStockToLots, expiryBucket, expiryText, fefoNext, type LotInput } from "./lots";
import { parseDateOnly } from "./dates";

const d = (s: string) => parseDateOnly(s)!;
const lot = (id: string, expiry: string | null, qty: number, received = "2026-11-01"): LotInput => ({
  id,
  expiryDate: expiry ? d(expiry) : null,
  receivedAt: new Date(`${received}T08:00:00Z`),
  ownQty: qty,
});

describe("allocateStockToLots (FEFO)", () => {
  it("assumes the earliest MHD was sold first", () => {
    const result = allocateStockToLots(15, [lot("late", "2027-03-01", 10), lot("early", "2026-12-01", 10)]);
    expect(result.map((l) => [l.id, l.remaining])).toEqual([
      ["early", 5],
      ["late", 10],
    ]);
  });
  it("puts lots without MHD last and orders ties by delivery date", () => {
    const result = allocateStockToLots(30, [lot("none", null, 10), lot("b", "2027-01-01", 10, "2026-11-05"), lot("a", "2027-01-01", 10, "2026-11-02")]);
    expect(result.map((l) => l.id)).toEqual(["a", "b", "none"]);
  });
  it("caps each lot at its own quantity and treats lot-less stock as sold first", () => {
    const result = allocateStockToLots(100, [lot("x", "2026-12-01", 10)]);
    expect(result[0].remaining).toBe(10);
  });
  it("gives nothing to lots when stock is zero or negative", () => {
    expect(allocateStockToLots(0, [lot("x", "2026-12-01", 10)])[0].remaining).toBe(0);
    expect(allocateStockToLots(-4, [lot("x", "2026-12-01", 10)])[0].remaining).toBe(0);
  });
  it("ignores a fully written-off lot (own quantity 0)", () => {
    const result = allocateStockToLots(10, [lot("gone", "2026-11-25", 0), lot("ok", "2027-01-01", 10)]);
    expect(result.find((l) => l.id === "gone")?.remaining).toBe(0);
    expect(fefoNext(result)?.id).toBe("ok");
  });
  it("hints the lot to sell first", () => {
    const result = allocateStockToLots(15, [lot("late", "2027-03-01", 10), lot("early", "2026-12-01", 10)]);
    expect(fefoNext(result)?.id).toBe("early");
    expect(fefoNext(allocateStockToLots(5, [lot("none", null, 5)]))).toBeNull();
  });
});

describe("expiry buckets", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  it("splits into expired / 7 days / 30 days / later", () => {
    expect(expiryBucket(d("2026-11-22"), now)).toBe("expired");
    expect(expiryBucket(d("2026-11-23"), now)).toBe("week");
    expect(expiryBucket(d("2026-11-30"), now)).toBe("week");
    expect(expiryBucket(d("2026-12-01"), now)).toBe("month");
    expect(expiryBucket(d("2026-12-23"), now)).toBe("month");
    expect(expiryBucket(d("2026-12-24"), now)).toBe("later");
  });
  it("says it in plain words", () => {
    expect(expiryText(d("2026-11-20"), now)).toBe("abgelaufen seit 3 Tagen");
    expect(expiryText(d("2026-11-23"), now)).toBe("läuft heute ab");
    expect(expiryText(d("2026-11-24"), now)).toBe("läuft morgen ab");
    expect(expiryText(d("2026-11-28"), now)).toBe("noch 5 Tage");
  });
});
