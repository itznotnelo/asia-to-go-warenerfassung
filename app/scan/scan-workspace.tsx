"use client";

import { useEffect, useReducer, useState } from "react";
import { useBarcodeScanner, type ScanResult } from "@/hooks/use-barcode-scanner";
import { initialScanState, scanReducer } from "./scan-reducer";
import { ScanStatus } from "./scan-status";
import { ManualEntry } from "./manual-entry";
import { ExistingProductPanel } from "./existing-product-panel";
import { ProductForm, mappedOffToFormValues } from "./product-form";
import { QuickCaptureForm } from "./quick-capture-form";
import { SearchPalette } from "./search-palette";
import { cn } from "@/lib/utils";
import { lookupBarcode, quickUpdateProduct, saveProduct } from "./actions";
import { saveErrorLines, settle } from "@/lib/save-error";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";

const SAVE_CONFIRMATION_MS = 1100;

export function ScanWorkspace({ categories }: { categories: CategoryOption[] }) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [lastSaved, setLastSaved] = useState<SaveProductInput | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<"full" | "quick">("full");

  async function handleScan(result: ScanResult) {
    setSaveError(null);
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
        setSaveError(null);
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

  // settle() never throws, so saving always resets and a failure is always shown.
  async function handleQuickUpdate(input: { id: string; priceRappen: number; isAvailable: boolean }) {
    setSaving(true);
    setSaveError(null);
    const result = await settle(() => quickUpdateProduct(input));
    setSaving(false);
    if (!result.ok) {
      setSaveError(saveErrorLines(result));
      return;
    }
    dispatch({ type: "saved", message: `${result.product.nameDe} aktualisiert` });
  }

  async function handleSave(input: SaveProductInput) {
    setSaving(true);
    setSaveError(null);
    // OFF-Bilder gleich mitschicken, wenn der aktuelle Scan von einem
    // OFF-Treffer kommt — spart den separaten Upload-Schritt für diesen Fall.
    const offImageUrls = state.status === "new-hit" ? state.mapped.imageUrls : undefined;
    const result = await settle(() => saveProduct(input, offImageUrls));
    setSaving(false);
    if (!result.ok) {
      setSaveError(saveErrorLines(result));
      return;
    }
    setLastSaved(input);
    dispatch({ type: "saved", message: `${result.product.nameDe} gespeichert (${result.product.sku})` });
  }

  function handleSelectFromSearch(product: ProductSummary) {
    setSearchOpen(false);
    setSaveError(null);
    dispatch({ type: "scan", result: { kind: "existing", product } });
  }

  function reset() {
    setSaveError(null);
    dispatch({ type: "reset" });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <ScanStatus state={state} />

      <ManualEntry onSubmit={submitManualBarcode} />

      <div role="group" aria-label="Erfassungsmodus" className="inline-flex self-center overflow-hidden rounded-md border border-border text-sm">
        <button
          type="button"
          aria-pressed={captureMode === "full"}
          onClick={() => setCaptureMode("full")}
          className={cn("rounded-none px-4 py-1.5", captureMode === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        >
          Vollerfassung
        </button>
        <button
          type="button"
          aria-pressed={captureMode === "quick"}
          onClick={() => setCaptureMode("quick")}
          className={cn("rounded-none border-l border-border px-4 py-1.5", captureMode === "quick" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        >
          Schnellerfassung
        </button>
      </div>

      {state.status === "existing" && (
        <ExistingProductPanel product={state.product} categories={categories} onSave={handleQuickUpdate} onCancel={reset} saving={saving} saveError={saveError} />
      )}

      {state.status === "new-hit" &&
        (() => {
          if (captureMode === "quick") {
            return (
              <QuickCaptureForm
                key={state.ean}
                ean={state.ean}
                categories={categories}
                initialNameDe={state.mapped.nameDe}
                dataSource="openfoodfacts"
                onSave={handleSave}
                onCancel={reset}
                saving={saving}
                saveError={saveError}
              />
            );
          }
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
              saveError={saveError}
            />
          );
        })()}

      {(state.status === "new-miss" || state.status === "off-error") &&
        (captureMode === "quick" ? (
          <QuickCaptureForm
            key={state.ean}
            ean={state.ean}
            categories={categories}
            dataSource="manual"
            onSave={handleSave}
            onCancel={reset}
            saving={saving}
            saveError={saveError}
          />
        ) : (
          <ProductForm
            key={state.ean}
            ean={state.ean}
            categories={categories}
            lastSaved={lastSaved ?? undefined}
            dataSource="manual"
            onSave={handleSave}
            onCancel={reset}
            saving={saving}
            saveError={saveError}
          />
        ))}

      <p className="text-center text-xs text-muted-foreground">Ctrl+K = Artikel suchen</p>

      {searchOpen && <SearchPalette onSelect={handleSelectFromSearch} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
