// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductSummary } from "@/lib/product-summary";
import { ExistingProductPanel } from "./existing-product-panel";

afterEach(cleanup);

const product: ProductSummary = {
  id: "p1",
  sku: "ASIA-00001",
  ean: "4006381333931",
  nameDe: "Sojasauce dunkel",
  nameOriginal: "酱油",
  brand: null,
  originCountry: null,
  categoryId: "c1",
  priceRappen: 450,
  vatRate: 2.6,
  unitType: "volume",
  contentAmount: 500,
  contentUnit: "ml",
  storageType: "ambient",
  ingredientsDe: null,
  allergens: [],
  traces: [],
  allergensConfirmed: false,
  isAvailable: true,
  dataSource: "manual",
  dataComplete: false,
  notes: null,
};

function setup(overrides: Partial<ProductSummary> = {}) {
  const onDirtyChange = vi.fn();
  const onSave = vi.fn();
  render(
    <ExistingProductPanel
      product={{ ...product, ...overrides }}
      categories={[]}
      onSave={onSave}
      onCancel={() => {}}
      onDirtyChange={onDirtyChange}
      saving={false}
      saveError={null}
    />,
  );
  return { onDirtyChange, onSave };
}

describe("ExistingProductPanel", () => {
  it("reports a changed price as unsaved input, and a reverted one as clean (review should #29)", () => {
    const { onDirtyChange } = setup();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const price = screen.getByLabelText("Preis (CHF)");
    fireEvent.change(price, { target: { value: "4.90" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(price, { target: { value: "4.50" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports a changed Verfügbar tick as unsaved input", () => {
    const { onDirtyChange } = setup();
    fireEvent.click(screen.getByLabelText("Verfügbar"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("points an unfinished article to its edit page", () => {
    setup();
    expect(screen.getByRole("link", { name: "Jetzt ergänzen" }).getAttribute("href")).toBe("/products/p1");
  });

  it("shows no hint for a complete article", () => {
    setup({ dataComplete: true });
    expect(screen.queryByRole("link", { name: "Jetzt ergänzen" })).toBeNull();
  });

  it("rejects a scanned barcode typed into the price field", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Preis (CHF)"), { target: { value: "abc" } });
    fireEvent.submit(screen.getByLabelText("Preis (CHF)").closest("form") as HTMLFormElement);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
