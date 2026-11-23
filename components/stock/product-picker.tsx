"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useBarcodeScanner, type ScanResult } from "@/hooks/use-barcode-scanner";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import { playScanError } from "@/lib/scan-feedback";
import { formatStockQty } from "@/lib/stock/units";
import type { StockProductView } from "@/lib/stock/product-stock";
import { lookupStockProductAction, searchStockProductsAction } from "@/app/stock/actions";
import { cn } from "@/lib/utils";

export interface ProductPickerHandle {
  focus: () => void;
}

interface ProductPickerProps {
  onPick: (product: StockProductView) => void;
  /** A valid barcode that is not in the article list. */
  onUnknown: (ean: string) => void;
  /** false while a dialog needs the keyboard. The scanner itself stays on in qty fields. */
  enabled?: boolean;
  label?: string;
}

/**
 * Scanner first: a USB scan anywhere on the page picks the article. The
 * field is the fallback: type a barcode, or 2+ letters of the name (also
 * the original name), SKU or brand, and pick from the list.
 */
export const ProductPicker = forwardRef<ProductPickerHandle, ProductPickerProps>(function ProductPicker(
  { onPick, onUnknown, enabled = true, label = "Artikel scannen" },
  ref,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockProductView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  async function lookup(ean: string) {
    const request = ++latest.current;
    setBusy(true);
    setHint(null);
    setResults(null);
    const product = await lookupStockProductAction(ean);
    if (request !== latest.current) return;
    setBusy(false);
    if (product) {
      setQuery("");
      onPick(product);
    } else {
      onUnknown(ean);
    }
  }

  function handleScan(result: ScanResult) {
    if (!enabled) return;
    if (!result.valid) {
      setHint(`Barcode ${result.barcode} ist ungültig. Bitte nochmals scannen.`);
      return;
    }
    void lookup(result.barcode);
  }

  const { submitManualBarcode } = useBarcodeScanner({
    onScan: handleScan,
    enabled,
    onRejectedScan: () => setHint("Scan nicht erkannt. Bitte nochmals scannen."),
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    if (/^\d{8,14}$/.test(text)) {
      submitManualBarcode(text);
      return;
    }
    const request = ++latest.current;
    setBusy(true);
    const found = await searchStockProductsAction(text);
    if (request !== latest.current) return;
    setBusy(false);
    setResults(found);
    if (found.length === 0) {
      playScanError();
      setHint(`Nichts gefunden für «${text}».`);
    }
  }

  function pick(product: StockProductView) {
    setResults(null);
    setQuery("");
    onPick(product);
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <label className="sr-only" htmlFor="stock-picker">
          {label}
        </label>
        <input
          id="stock-picker"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`${label} oder Name / Barcode eintippen`}
          autoComplete="off"
          className={cn(inputClass(), "flex-1")}
          disabled={!enabled}
        />
        <Button type="submit" variant="outline" className="h-11 px-4" disabled={!enabled || busy}>
          {busy ? "Sucht …" : "Suchen"}
        </Button>
      </form>
      {hint && <p className="text-sm text-destructive">{hint}</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col rounded-lg border border-border bg-card">
          {results.map((product) => (
            <li key={product.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => pick(product)}
                className="flex min-h-12 w-full items-center justify-between gap-4 px-3 py-2 text-left hover:bg-muted/50"
              >
                <span>
                  {product.nameDe}
                  {product.nameOriginal && <span className="text-muted-foreground"> · {product.nameOriginal}</span>}
                  <span className="font-numeric text-xs text-muted-foreground"> · {product.sku}</span>
                </span>
                <span className="font-numeric text-sm text-muted-foreground">
                  {product.stockQty === null ? "kein Bestand geführt" : formatStockQty(product.stockQty, product.unitType)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
