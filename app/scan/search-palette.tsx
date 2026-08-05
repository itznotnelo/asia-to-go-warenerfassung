"use client";

import { useEffect, useState } from "react";
import { formatChf } from "@/lib/pricing";
import { searchProducts } from "./actions";
import type { ProductSummary } from "@/lib/product-summary";

interface SearchPaletteProps {
  onSelect: (product: ProductSummary) => void;
  onClose: () => void;
}

/** Ctrl+K — Artikel per Name/Original-Name/SKU/EAN finden und direkt in die Schnellansicht springen. */
export function SearchPalette({ onSelect, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    searchProducts(query).then((found) => {
      if (!cancelled) setResults(found);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-popover p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, Originalname, SKU oder EAN …"
          className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"
              >
                <span>
                  <span className="block">{product.nameDe}</span>
                  <span className="font-numeric block text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <span className="font-numeric text-sm text-muted-foreground">{formatChf(product.priceRappen)}</span>
              </button>
            </li>
          ))}
          {query.trim() && results.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">Keine Treffer.</li>}
        </ul>
        <p className="mt-2 px-3 text-xs text-muted-foreground">Esc = Schliessen</p>
      </div>
    </div>
  );
}
