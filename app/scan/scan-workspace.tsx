"use client";

import { useEffect, useReducer, useState } from "react";
import { useBarcodeScanner, type ScanResult } from "@/hooks/use-barcode-scanner";
import { initialScanState, scanReducer } from "./scan-reducer";
import { ScanStatus } from "./scan-status";
import { ManualEntry } from "./manual-entry";
import { ExistingProductPanel } from "./existing-product-panel";
import { ProductForm, mappedOffToFormValues } from "./product-form";
import { SearchPalette } from "./search-palette";
import { lookupBarcode, quickUpdateProduct, saveProduct } from "./actions";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";

const SAVE_CONFIRMATION_MS = 1100;

export function ScanWorkspace({ categories }: { categories: CategoryOption[] }) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<SaveProductInput | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  async function handleScan(result: ScanResult) {
    if (!result.valid) {
      dispatch({ type: "scan", result: { kind: "invalid", barcode: result.barcode } });
      return;
    }
    dispatch({ type: "scan", result: { kind: "looking-up", ean: result.barcode } });
    const lookup = await lookupBarcode(result.barcode);
    dispatch({ type: "scan", result: lookup });
  }

  const { submitManualBarcode } = useBarcodeScanner({ onScan: handleScan });

  // App-weite Shortcuts unabhängig vom Fokus. Ctrl+D wirkt lokal im
  // Formular (dort, wo es etwas zu duplizieren gibt) — siehe ProductForm.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && !searchOpen && state.status !== "idle" && state.status !== "saved") {
        dispatch({ type: "reset" });
      }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [searchOpen, state.status]);

  // Bestätigung nach dem Speichern verschwindet von selbst, Scanner ist die ganze Zeit über aktiv.
  useEffect(() => {
    if (state.status !== "saved") return;
    const timer = setTimeout(() => dispatch({ type: "reset" }), SAVE_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  async function handleQuickUpdate(input: { id: string; priceRappen: number; isAvailable: boolean }) {
    setSaving(true);
    const result = await quickUpdateProduct(input);
    setSaving(false);
    if (result.ok) {
      dispatch({ type: "saved", message: `${result.product.nameDe} aktualisiert` });
    }
  }

  async function handleSave(input: SaveProductInput) {
    setSaving(true);
    const result = await saveProduct(input);
    setSaving(false);
    if (result.ok) {
      setLastSaved(input);
      dispatch({ type: "saved", message: `${result.product.nameDe} gespeichert (${result.product.sku})` });
    }
  }

  function handleSelectFromSearch(product: ProductSummary) {
    setSearchOpen(false);
    dispatch({ type: "scan", result: { kind: "existing", product } });
  }

  function reset() {
    dispatch({ type: "reset" });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <ScanStatus state={state} />

      <ManualEntry onSubmit={submitManualBarcode} />

      {state.status === "existing" && (
        <ExistingProductPanel product={state.product} categories={categories} onSave={handleQuickUpdate} onCancel={reset} saving={saving} />
      )}

      {state.status === "new-hit" &&
        (() => {
          const { initial, sourced } = mappedOffToFormValues(state.mapped);
          return (
            <ProductForm
              key={state.ean}
              ean={state.ean}
              categories={categories}
              initial={initial}
              sourced={sourced}
              lastSaved={lastSaved ?? undefined}
              dataSource="openfoodfacts"
              onSave={handleSave}
              onCancel={reset}
              saving={saving}
            />
          );
        })()}

      {(state.status === "new-miss" || state.status === "off-error") && (
        <ProductForm
          key={state.ean}
          ean={state.ean}
          categories={categories}
          lastSaved={lastSaved ?? undefined}
          dataSource="manual"
          onSave={handleSave}
          onCancel={reset}
          saving={saving}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">Ctrl+K = Artikel suchen</p>

      {searchOpen && <SearchPalette onSelect={handleSelectFromSearch} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
