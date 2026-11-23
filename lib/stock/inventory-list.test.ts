import { describe, expect, it } from "vitest";
import { buildInventoryList, inventoryCsv, type InventoryRow } from "./inventory-list";

const row = (over: Partial<InventoryRow>): InventoryRow => ({
  sku: "ASIA-00001",
  ean: "8801043014809",
  nameDe: "Shin Ramyun",
  nameOriginal: "신라면",
  category: "Nudeln",
  unitType: "piece",
  qty: 10,
  purchasePriceRappen: 95,
  ...over,
});

describe("year-end inventory list", () => {
  it("values stock at EK, skips zero, never adds value for negative stock", () => {
    const list = buildInventoryList([
      row({}),
      row({ sku: "B", qty: 0 }),
      row({ sku: "C", qty: -2 }),
      row({ sku: "D", qty: 4, purchasePriceRappen: null }),
      row({ sku: "E", unitType: "weight", qty: 2500, purchasePriceRappen: 400, category: "Reis" }),
    ]);
    // Sorted by category (Nudeln before Reis), zero stock left out.
    expect(list.lines.map((l) => l.sku)).toEqual(["ASIA-00001", "C", "D", "E"]);
    expect(list.totalRappen).toBe(950 + 1000);
    expect(list.withoutCost).toBe(1);
    expect(list.negative).toBe(1);
  });
  it("exports Swiss Excel CSV with EAN as text, CHF with point and a total row", () => {
    const csv = inventoryCsv(buildInventoryList([row({}), row({ sku: "E", unitType: "weight", qty: 2500, purchasePriceRappen: 400 })]), "31.12.2026");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Artikelnr;EAN;Name;Originalname;Kategorie;Menge;Einheit;EK CHF pro Einheit;Wert CHF");
    expect(lines[1]).toBe('ASIA-00001;"\t8801043014809";Shin Ramyun;신라면;Nudeln;10;Stk;0.95;9.50');
    expect(lines[2]).toContain(";2.500;kg;4.00;10.00");
    expect(lines[4]).toContain("Total Warenlager zu EK per 31.12.2026");
    expect(lines[4].endsWith(";19.50")).toBe(true);
  });
});
