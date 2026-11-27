"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  // Row that Enter opens; starts on the first hit so Enter alone is enough.
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    let cancelled = false;
    searchProducts(query).then((found) => {
      if (cancelled) return;
      setResults(found);
      setActiveIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    // jsdom has no scrollIntoView, hence the optional call.
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, Math.min(index + 1, results.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const product = results[activeIndex] ?? results[0];
      if (product) onSelect(product);
    }
  }

  const activeProduct = results[activeIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-popover p-3 shadow-[0_16px_48px_-12px_oklch(0_0_0/0.6)]"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-label="Artikel suchen"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeProduct ? optionId(activeIndex) : undefined}
          placeholder="Name, Originalname, SKU oder EAN …"
          className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <ul ref={listRef} id={listId} role="listbox" aria-label="Treffer" className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
          {results.map((product, index) => {
            const active = index === activeIndex;
            return (
              <li
                key={product.id}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={active}
                onClick={() => onSelect(product)}
                onMouseMove={() => !active && setActiveIndex(index)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left ${
                  active ? "bg-muted ring-1 ring-ring ring-inset" : ""
                }`}
              >
                <span>
                  <span className="block">{product.nameDe}</span>
                  <span className="font-numeric block text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <span className="font-numeric text-sm text-muted-foreground">{formatChf(product.priceRappen)}</span>
              </li>
            );
          })}
          {query.trim() && results.length === 0 && <li role="presentation" className="px-3 py-2.5 text-sm text-muted-foreground">Keine Treffer.</li>}
        </ul>
        <p className="mt-2 px-3 text-xs text-muted-foreground">↑ ↓ = Auswählen · Enter = Öffnen · Esc = Schliessen</p>
      </div>
    </div>
  );
}
