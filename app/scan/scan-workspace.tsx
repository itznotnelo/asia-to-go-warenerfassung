"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { useBarcodeScanner, type ScanResult } from "@/hooks/use-barcode-scanner";
import { initialScanState, scanReducer } from "./scan-reducer";
import { ScanStatus } from "./scan-status";
import { ManualEntry } from "./manual-entry";
import { ExistingProductPanel } from "./existing-product-panel";
import { ProductForm, mappedOffToFormValues } from "./product-form";
import { QuickCaptureForm } from "./quick-capture-form";
import { SearchPalette } from "./search-palette";
import { DiscardDialog } from "./discard-dialog";
import { CAPTURE_FORM_ID } from "./product-form-helpers";
import { playScanError } from "@/lib/scan-feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lookupBarcode, quickUpdateProduct, saveProduct } from "./actions";
import { restoreProduct } from "@/app/products/actions";
import { saveErrorLines, settle } from "@/lib/save-error";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";

const SAVE_CONFIRMATION_MS = 1100;
const SCAN_HINT_MS = 4000;
const SCAN_REJECTED_HINT = "Scan nicht erkannt. Bitte nochmals scannen oder den Barcode unten eintippen.";
const SCAN_BLOCKED_HINT = "Erst speichern oder verwerfen, dann scannen.";

export function ScanWorkspace({ categories }: { categories: CategoryOption[] }) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [lastSaved, setLastSaved] = useState<SaveProductInput | null>(null);
  // Stays on screen after the green confirmation fades, so the way to photo and details is one click.
  const [lastSavedProduct, setLastSavedProduct] = useState<ProductSummary | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<"full" | "quick">("full");
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Only the newest lookup may land; a slow earlier one must not replace it (review should #29).
  const latestLookup = useRef(0);

  async function handleScan(result: ScanResult) {
    // A scan never throws away typed input: error tone + hint, the form stays.
    if (formDirty) {
      playScanError();
      setScanHint(SCAN_BLOCKED_HINT);
      return;
    }
    setSaveError(null);
    setScanHint(null);
    const lookupId = ++latestLookup.current;
    if (!result.valid) {
      dispatch({ type: "scan", result: { kind: "invalid", barcode: result.barcode } });
      return;
    }
    dispatch({ type: "scan", result: { kind: "looking-up", ean: result.barcode } });
    const lookup = await lookupBarcode(result.barcode);
    if (lookupId !== latestLookup.current) return;
    dispatch({ type: "scan", result: lookup });
  }

  // A too-slow scan only shows a hint; it never throws away an open form.
  const { submitManualBarcode } = useBarcodeScanner({ onScan: handleScan, onRejectedScan: () => setScanHint(SCAN_REJECTED_HINT) });

  useEffect(() => {
    if (!scanHint) return;
    const timer = setTimeout(() => setScanHint(null), SCAN_HINT_MS);
    return () => clearTimeout(timer);
  }, [scanHint]);

  // App-weite Shortcuts unabhängig vom Fokus. Ctrl+D wirkt lokal im
  // Formular (dort, wo es etwas zu duplizieren gibt) — siehe ProductForm.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && !searchOpen && !discardOpen && state.status !== "idle" && state.status !== "saved") {
        requestCancel();
      }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  });

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
    setLastSavedProduct(result.product);
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
    setLastSavedProduct(result.product);
    dispatch({ type: "saved", message: `${result.product.nameDe} gespeichert (${result.product.sku})` });
  }

  // Restored articles go straight to the quick view, so the scan ends where a normal hit would.
  async function handleRestore(product: ProductSummary) {
    setSaving(true);
    setSaveError(null);
    const result = await settle(() => restoreProduct(product.id));
    setSaving(false);
    if (!result.ok) {
      setSaveError([result.message]);
      return;
    }
    dispatch({ type: "scan", result: { kind: "existing", product } });
  }

  function handleSelectFromSearch(product: ProductSummary) {
    setSearchOpen(false);
    if (formDirty) {
      setScanHint(SCAN_BLOCKED_HINT);
      return;
    }
    latestLookup.current++;
    setSaveError(null);
    dispatch({ type: "scan", result: { kind: "existing", product } });
  }

  function reset() {
    latestLookup.current++;
    setDiscardOpen(false);
    setSaveError(null);
    dispatch({ type: "reset" });
  }

  // Esc and Abbrechen ask first when the open form holds input.
  function requestCancel() {
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    reset();
  }

  function saveFromDiscardDialog() {
    setDiscardOpen(false);
    (document.getElementById(CAPTURE_FORM_ID) as HTMLFormElement | null)?.requestSubmit();
  }

  function captureWithoutBarcode() {
    latestLookup.current++;
    setSaveError(null);
    setScanHint(null);
    dispatch({ type: "no-barcode" });
  }

  const manualEan = state.status === "new-miss" || state.status === "off-error" ? state.ean : null;
  // Offered whenever no form is open; in the invalid state it is the way out for a misprinted code.
  const canCaptureWithoutBarcode = state.status === "idle" || state.status === "invalid" || state.status === "saved";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <ScanStatus state={state} />

      {scanHint && (
        <p role="alert" className="rounded-md bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
          {scanHint}
        </p>
      )}

      <ManualEntry onSubmit={submitManualBarcode} />

      {canCaptureWithoutBarcode && (
        <Button type="button" variant="outline" className="self-center" onClick={captureWithoutBarcode}>
          {state.status === "invalid" ? "Trotzdem ohne Barcode erfassen" : "Artikel ohne Barcode erfassen"}
        </Button>
      )}

      <div role="group" aria-label="Erfassungsmodus" className="inline-flex self-center overflow-hidden rounded-md border border-border text-sm">
        <button
          type="button"
          aria-pressed={captureMode === "full"}
          disabled={formDirty}
          onClick={() => setCaptureMode("full")}
          className={cn("rounded-none px-4 py-1.5", captureMode === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        >
          Vollerfassung
        </button>
        <button
          type="button"
          aria-pressed={captureMode === "quick"}
          disabled={formDirty}
          onClick={() => setCaptureMode("quick")}
          className={cn("rounded-none border-l border-border px-4 py-1.5", captureMode === "quick" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        >
          Schnellerfassung
        </button>
      </div>

      {state.status === "existing" && (
        <ExistingProductPanel product={state.product} categories={categories} onSave={handleQuickUpdate} onCancel={requestCancel} onDirtyChange={setFormDirty} saving={saving} saveError={saveError} />
      )}

      {state.status === "archived" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            Dieser Barcode gehört zu einem gelöschten Artikel. Wiederherstellen, um ihn wieder zu verwenden.
          </p>
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError.join(" ")}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" disabled={saving} onClick={() => handleRestore(state.product)}>
              {saving ? "Wird wiederhergestellt …" : "Wiederherstellen"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={reset}>
              Abbrechen
            </Button>
          </div>
        </div>
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
                onCancel={requestCancel} onDirtyChange={setFormDirty}
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
              onCancel={requestCancel} onDirtyChange={setFormDirty}
              saving={saving}
              saveError={saveError}
            />
          );
        })()}

      {(state.status === "new-miss" || state.status === "off-error" || state.status === "no-barcode") &&
        (captureMode === "quick" ? (
          <QuickCaptureForm
            key={manualEan ?? "no-barcode"}
            ean={manualEan}
            categories={categories}
            dataSource="manual"
            onSave={handleSave}
            onCancel={requestCancel} onDirtyChange={setFormDirty}
            saving={saving}
            saveError={saveError}
          />
        ) : (
          <ProductForm
            key={manualEan ?? "no-barcode"}
            ean={manualEan}
            categories={categories}
            lastSaved={lastSaved ?? undefined}
            dataSource="manual"
            onSave={handleSave}
            onCancel={requestCancel} onDirtyChange={setFormDirty}
            saving={saving}
            saveError={saveError}
          />
        ))}

      {lastSavedProduct && (state.status === "idle" || state.status === "saved") && (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          Zuletzt gespeichert: <span className="font-medium">{lastSavedProduct.nameDe}</span>.{" "}
          {lastSavedProduct.dataComplete ? (
            "Vollständig."
          ) : (
            <>
              Noch nicht im Webshop.{" "}
              <Link href={`/products/${lastSavedProduct.id}`} className="font-medium underline underline-offset-2">
                Foto und Details ergänzen
              </Link>
            </>
          )}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">Ctrl+K = Artikel suchen</p>

      {searchOpen && <SearchPalette onSelect={handleSelectFromSearch} onClose={() => setSearchOpen(false)} />}

      {discardOpen && <DiscardDialog onSave={saveFromDiscardDialog} onDiscard={reset} onBack={() => setDiscardOpen(false)} />}
    </div>
  );
}
