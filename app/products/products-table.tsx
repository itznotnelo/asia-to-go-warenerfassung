"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { formatChf, parseChfToRappen, PRICE_ERROR } from "@/lib/pricing";
import { formatStockQty } from "@/lib/stock/units";
import { quickUpdateProduct } from "@/app/scan/actions";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";
import { bulkUpdateProducts } from "./actions";
import type { BulkUpdatePatch } from "@/lib/bulk-update-patch";
import { BulkActionBar } from "./bulk-action-bar";
import { SaveErrorBox } from "@/components/save-error-box";
import { saveErrorLines, settle, type SaveFailure } from "@/lib/save-error";

const STORAGE_LABELS: Record<string, string> = { ambient: "Trocken", chilled: "Gekühlt", frozen: "Tiefgekühlt" };
const SOURCE_LABELS: Record<string, string> = { openfoodfacts: "Online", manual: "Manuell", ai_extracted: "KI" };

interface ProductsTableProps {
  products: ProductSummary[];
  categories: CategoryOption[];
}

export function ProductsTable({ products, categories }: ProductsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [priceDraftError, setPriceDraftError] = useState(false);
  const [updateError, setUpdateError] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))));
  }

  function startEditPrice(product: ProductSummary) {
    setEditingPriceId(product.id);
    setPriceDraft((product.priceRappen / 100).toFixed(2));
    setPriceDraftError(false);
  }

  function commitPrice(product: ProductSummary) {
    const priceRappen = parseChfToRappen(priceDraft);
    // Keep the editor open on unparseable input instead of silently dropping it; Esc cancels.
    if (priceRappen === null || priceRappen <= 0) {
      setPriceDraftError(true);
      return;
    }
    setPriceDraftError(false);
    setEditingPriceId(null);
    if (priceRappen === product.priceRappen) return;
    runUpdate(() => quickUpdateProduct({ id: product.id, priceRappen, isAvailable: product.isAvailable }));
  }

  function toggleAvailability(product: ProductSummary) {
    runUpdate(() => quickUpdateProduct({ id: product.id, priceRappen: product.priceRappen, isAvailable: !product.isAvailable }));
  }

  function applyBulk(patch: BulkUpdatePatch) {
    if (selected.size === 0) return;
    // Selection stays on failure so the change can be retried.
    runUpdate(() => bulkUpdateProducts({ ids: [...selected], ...patch }), () => setSelected(new Set()));
  }

  function runUpdate(action: () => Promise<{ ok: true } | SaveFailure>, onSuccess?: () => void) {
    setUpdateError(null);
    startTransition(async () => {
      const result = await settle(action);
      if (result.ok) onSuccess?.();
      else setUpdateError(saveErrorLines(result));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SaveErrorBox lines={updateError} />

      {selected.size > 0 && <BulkActionBar count={selected.size} categories={categories} onApply={applyBulk} disabled={isPending} />}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" aria-label="Artikelliste">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2" scope="col">
                <input type="checkbox" aria-label="Alle auswählen" checked={selected.size === products.length && products.length > 0} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2" scope="col">Artikel</th>
              <th className="px-3 py-2" scope="col">Kategorie</th>
              <th className="px-3 py-2" scope="col">Preis</th>
              <th className="px-3 py-2" scope="col">Lagerung</th>
              <th className="px-3 py-2" scope="col">Quelle</th>
              <th className="px-3 py-2" scope="col">Status</th>
              <th className="px-3 py-2" scope="col">Verfügbar / Bestand</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const category = categories.find((c) => c.id === product.categoryId);
              return (
                <tr key={product.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Auswahl ${product.nameDe}`} checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/products/${product.id}`} className="hover:underline">
                      {product.nameDe}
                    </Link>
                    <div className="font-numeric text-xs text-muted-foreground">
                      {product.sku}
                      {product.nameOriginal && ` · ${product.nameOriginal}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{category?.name ?? "ohne Kategorie"}</td>
                  <td className="font-numeric px-3 py-2">
                    {editingPriceId === product.id ? (
                      <>
                        <input
                          autoFocus
                          inputMode="decimal"
                          aria-label={`Preis ${product.nameDe}`}
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          onBlur={() => commitPrice(product)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitPrice(product);
                            if (e.key === "Escape") setEditingPriceId(null);
                          }}
                          aria-invalid={priceDraftError}
                          disabled={isPending}
                          className="h-8 w-24 rounded border border-input bg-transparent px-2 aria-invalid:border-destructive disabled:opacity-50"
                        />
                        {priceDraftError && (
                          <span role="alert" className="block text-xs text-destructive">
                            {PRICE_ERROR}
                          </span>
                        )}
                      </>
                    ) : (
                      <button type="button" onClick={() => startEditPrice(product)} disabled={isPending} className="hover:underline disabled:opacity-50">
                        {formatChf(product.priceRappen)}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{STORAGE_LABELS[product.storageType]}</td>
                  <td className="px-3 py-2 text-muted-foreground">{SOURCE_LABELS[product.dataSource]}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-sm px-2 py-0.5 text-xs",
                        product.dataComplete ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {product.dataComplete ? "vollständig" : "unvollständig"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {product.stockQty != null ? (
                      // Tracked: the webshop follows the stock, no manual switch.
                      <span
                        title="Bestand wird geführt: im Webshop sichtbar, solange genug da ist"
                        className={cn("font-numeric text-xs", product.stockQty < 0 ? "text-destructive" : product.isAvailable ? "text-foreground" : "text-muted-foreground")}
                      >
                        {formatStockQty(product.stockQty, product.unitType)}
                      </span>
                    ) : (
                      <input type="checkbox" aria-label={`Verfügbar: ${product.nameDe}`} checked={product.isAvailable} onChange={() => toggleAvailability(product)} disabled={isPending} />
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Keine Artikel gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
