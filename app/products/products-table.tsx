"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { formatChf } from "@/lib/pricing";
import { quickUpdateProduct } from "@/app/scan/actions";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";
import { bulkUpdateProducts } from "./actions";
import type { BulkUpdatePatch } from "@/lib/bulk-update-patch";
import { BulkActionBar } from "./bulk-action-bar";

const STORAGE_LABELS: Record<string, string> = { ambient: "Trocken", chilled: "Gekühlt", frozen: "Tiefgekühlt" };
const SOURCE_LABELS: Record<string, string> = { openfoodfacts: "OFF", manual: "Manuell", ai_extracted: "KI" };

interface ProductsTableProps {
  products: ProductSummary[];
  categories: CategoryOption[];
}

export function ProductsTable({ products, categories }: ProductsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [, startTransition] = useTransition();

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
  }

  function commitPrice(product: ProductSummary) {
    const priceRappen = Math.round(Number.parseFloat(priceDraft.replace(",", ".")) * 100);
    setEditingPriceId(null);
    if (!Number.isFinite(priceRappen) || priceRappen <= 0 || priceRappen === product.priceRappen) return;
    startTransition(async () => {
      await quickUpdateProduct({ id: product.id, priceRappen, isAvailable: product.isAvailable });
      router.refresh();
    });
  }

  function toggleAvailability(product: ProductSummary) {
    startTransition(async () => {
      await quickUpdateProduct({ id: product.id, priceRappen: product.priceRappen, isAvailable: !product.isAvailable });
      router.refresh();
    });
  }

  function applyBulk(patch: BulkUpdatePatch) {
    if (selected.size === 0) return;
    startTransition(async () => {
      await bulkUpdateProducts({ ids: [...selected], ...patch });
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && <BulkActionBar count={selected.size} categories={categories} onApply={applyBulk} disabled={false} />}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={selected.size === products.length && products.length > 0} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2">Artikel</th>
              <th className="px-3 py-2">Kategorie</th>
              <th className="px-3 py-2">Preis</th>
              <th className="px-3 py-2">Lagerung</th>
              <th className="px-3 py-2">Quelle</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Verfügbar</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const category = categories.find((c) => c.id === product.categoryId);
              return (
                <tr key={product.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
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
                  <td className="px-3 py-2 text-muted-foreground">{category?.name ?? "—"}</td>
                  <td className="font-numeric px-3 py-2">
                    {editingPriceId === product.id ? (
                      <input
                        autoFocus
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        onBlur={() => commitPrice(product)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitPrice(product);
                          if (e.key === "Escape") setEditingPriceId(null);
                        }}
                        className="h-8 w-24 rounded border border-input bg-transparent px-2"
                      />
                    ) : (
                      <button type="button" onClick={() => startEditPrice(product)} className="hover:underline">
                        {formatChf(product.priceRappen)}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{STORAGE_LABELS[product.storageType]}</td>
                  <td className="px-3 py-2 text-muted-foreground">{SOURCE_LABELS[product.dataSource]}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        product.dataComplete ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {product.dataComplete ? "vollständig" : "unvollständig"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={product.isAvailable} onChange={() => toggleAvailability(product)} />
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
