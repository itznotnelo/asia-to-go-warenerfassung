import { describe, expect, it } from "vitest";
import { initialScanState, scanReducer, type ScanState } from "./scan-reducer";
import type { ProductSummary } from "./actions";

const product: ProductSummary = {
  id: "p1",
  sku: "ASIA-00001",
  ean: "3017620422003",
  nameDe: "Testprodukt",
  nameOriginal: null,
  brand: null,
  originCountry: null,
  categoryId: "c1",
  priceRappen: 100,
  vatRate: 2.6,
  unitType: "piece",
  contentAmount: null,
  contentUnit: null,
  storageType: "ambient",
  ingredientsDe: null,
  allergens: [],
  isAvailable: true,
  dataSource: "manual",
  dataComplete: false,
  notes: null,
};

describe("scanReducer", () => {
  it("starts idle", () => {
    expect(initialScanState).toEqual({ status: "idle" });
  });

  it("goes to looking-up while a request is in flight", () => {
    const next = scanReducer(initialScanState, { type: "scan", result: { kind: "looking-up", ean: "123" } });
    expect(next).toEqual({ status: "looking-up", ean: "123" });
  });

  it("shows the quick-view for an existing product", () => {
    const next = scanReducer(initialScanState, { type: "scan", result: { kind: "existing", product } });
    expect(next).toEqual({ status: "existing", product });
  });

  it("shows the prefilled form on an OFF hit", () => {
    const mapped = { allergens: [], traces: [], imageUrls: {} };
    const next = scanReducer(initialScanState, {
      type: "scan",
      result: { kind: "off-hit", ean: "123", mapped },
    });
    expect(next).toEqual({ status: "new-hit", ean: "123", mapped });
  });

  it("shows the empty form on an OFF miss", () => {
    const next = scanReducer(initialScanState, { type: "scan", result: { kind: "off-miss", ean: "123" } });
    expect(next).toEqual({ status: "new-miss", ean: "123" });
  });

  it("shows an error state distinct from a confirmed miss", () => {
    const next = scanReducer(initialScanState, { type: "scan", result: { kind: "off-error", ean: "123" } });
    expect(next).toEqual({ status: "off-error", ean: "123" });
  });

  it("shows an invalid state for a bad check digit, without ever calling the server", () => {
    const next = scanReducer(initialScanState, { type: "scan", result: { kind: "invalid", barcode: "999" } });
    expect(next).toEqual({ status: "invalid", barcode: "999" });
  });

  it("shows a save confirmation", () => {
    const next = scanReducer(initialScanState, { type: "saved", message: "Gespeichert" });
    expect(next).toEqual({ status: "saved", message: "Gespeichert" });
  });

  it("resets to idle from any state", () => {
    const states: ScanState[] = [
      { status: "looking-up", ean: "1" },
      { status: "existing", product },
      { status: "new-miss", ean: "1" },
      { status: "off-error", ean: "1" },
      { status: "invalid", barcode: "1" },
    ];
    for (const state of states) {
      expect(scanReducer(state, { type: "reset" })).toEqual({ status: "idle" });
    }
  });
});
