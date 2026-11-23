import { describe, expect, it } from "vitest";
import { buildReorderList, needsReorder, orderMessage, suggestedOrderQty, type ReorderProduct } from "./reorder";

const product = (over: Partial<ReorderProduct>): ReorderProduct => ({
  id: "p",
  sku: "ASIA-00001",
  ean: "8801043014809",
  nameDe: "Shin Ramyun",
  unitType: "piece",
  stockQty: 2,
  minStock: 6,
  reorderQty: null,
  packSize: 1,
  supplierId: null,
  ...over,
});

describe("needsReorder", () => {
  it("needs tracking and a reorder point, and stock at or below it", () => {
    expect(needsReorder({ stockQty: 6, minStock: 6 })).toBe(true);
    expect(needsReorder({ stockQty: 7, minStock: 6 })).toBe(false);
    expect(needsReorder({ stockQty: null, minStock: 6 })).toBe(false);
    expect(needsReorder({ stockQty: 0, minStock: null })).toBe(false);
  });
});

describe("suggestedOrderQty", () => {
  it("uses the reorder quantity, rounded up to whole cartons", () => {
    expect(suggestedOrderQty({ stockQty: 2, minStock: 6, reorderQty: 30, packSize: 24 })).toBe(48);
    expect(suggestedOrderQty({ stockQty: 2, minStock: 6, reorderQty: 24, packSize: 24 })).toBe(24);
  });
  it("fills up to twice the reorder point without a reorder quantity", () => {
    expect(suggestedOrderQty({ stockQty: 2, minStock: 6, reorderQty: null, packSize: 1 })).toBe(10);
    expect(suggestedOrderQty({ stockQty: -3, minStock: 6, reorderQty: null, packSize: 1 })).toBe(15);
  });
  it("orders at least one pack", () => {
    expect(suggestedOrderQty({ stockQty: 0, minStock: 0, reorderQty: null, packSize: 12 })).toBe(12);
  });
});

describe("buildReorderList", () => {
  const suppliers = [
    { id: "s2", name: "Tak Wah", customerNumber: null, phone: null, email: null },
    { id: "s1", name: "Asia Express", customerNumber: "K-4711", phone: null, email: null },
  ];
  it("groups by supplier, suppliers by name, without supplier last, skips what's enough", () => {
    const groups = buildReorderList(
      [
        product({ id: "a", nameDe: "Reis", supplierId: "s2" }),
        product({ id: "b", nameDe: "Nudeln", supplierId: "s1" }),
        product({ id: "c", nameDe: "Algen", supplierId: null }),
        product({ id: "d", nameDe: "Sojasauce", supplierId: "s1" }),
        product({ id: "e", nameDe: "Genug", stockQty: 50, supplierId: "s1" }),
      ],
      suppliers,
    );
    expect(groups.map((g) => g.supplier?.name ?? null)).toEqual(["Asia Express", "Tak Wah", null]);
    expect(groups[0].lines.map((l) => l.nameDe)).toEqual(["Nudeln", "Sojasauce"]);
  });
  it("writes a plain order message with the customer number and cartons", () => {
    const [group] = buildReorderList([product({ supplierId: "s1", packSize: 24, reorderQty: 48 })], suppliers);
    const text = orderMessage(group);
    expect(text).toContain("Kundennummer K-4711");
    expect(text).toContain("- 2 Karton à 24 Stk  Shin Ramyun (EAN 8801043014809)");
    expect(text).not.toMatch(/[—–]/);
  });
});
