"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatChf } from "@/lib/pricing";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductSummary } from "@/lib/product-summary";

interface ExistingProductPanelProps {
  product: ProductSummary;
  categories: CategoryOption[];
  onSave: (input: { id: string; priceRappen: number; isAvailable: boolean }) => void;
  onCancel: () => void;
  saving: boolean;
}

/** Schnellansicht für einen bereits erfassten Artikel — Preis-Korrektur und Verfügbarkeit, unter 5 Sekunden erledigt. */
export function ExistingProductPanel({ product, categories, onSave, onCancel, saving }: ExistingProductPanelProps) {
  const [priceChf, setPriceChf] = useState((product.priceRappen / 100).toFixed(2));
  const [isAvailable, setIsAvailable] = useState(product.isAvailable);
  const categoryName = categories.find((c) => c.id === product.categoryId)?.name;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceRappen = Math.round(Number.parseFloat(priceChf.replace(",", ".")) * 100);
    if (!Number.isFinite(priceRappen) || priceRappen <= 0) return;
    onSave({ id: product.id, priceRappen, isAvailable });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">{product.nameDe}</h2>
        {product.nameOriginal && <p className="text-muted-foreground">{product.nameOriginal}</p>}
        <p className="font-numeric mt-1 text-sm text-muted-foreground">
          {product.sku} {categoryName && `· ${categoryName}`} {product.ean && `· ${product.ean}`}
        </p>
        <p className="font-numeric mt-1 text-sm text-muted-foreground">
          Aktuell: {formatChf(product.priceRappen)} {!product.isAvailable && "· nicht verfügbar"}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Preis (CHF)</span>
          <input
            autoFocus
            value={priceChf}
            onChange={(event) => setPriceChf(event.target.value)}
            inputMode="decimal"
            className="font-numeric h-14 w-40 rounded-lg border border-input bg-transparent px-3 text-2xl outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <label className="flex h-14 items-center gap-3 rounded-lg border border-input px-4">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(event) => setIsAvailable(event.target.checked)}
            className="size-5 accent-primary"
          />
          <span>Verfügbar</span>
        </label>

        <Button type="submit" size="lg" className="h-14 px-6 text-base" disabled={saving}>
          {saving ? "Speichert …" : "Speichern"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Enter = Speichern · Esc = Abbrechen</p>
    </form>
  );
}
