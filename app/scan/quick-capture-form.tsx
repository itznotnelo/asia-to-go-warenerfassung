"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import type { CategoryOption } from "@/lib/category-option";
import type { DataSource } from "@/lib/generated/prisma/client";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import { buildQuickCaptureInput } from "./product-form-helpers";

interface QuickCaptureFormProps {
  ean: string | null;
  categories: CategoryOption[];
  initialNameDe?: string;
  dataSource: DataSource;
  onSave: (input: SaveProductInput) => void;
  onCancel: () => void;
  saving: boolean;
}

/**
 * Zwei-Pass-Modus: nur Name + Kategorie + Preis, sofort weiter zum nächsten
 * Scan. Der Artikel landet unvollständig im Arbeitsvorrat (/dashboard) —
 * Details kommen später am Schreibtisch über /products/[id].
 */
export function QuickCaptureForm({ ean, categories, initialNameDe, dataSource, onSave, onCancel, saving }: QuickCaptureFormProps) {
  const [nameDe, setNameDe] = useState(initialNameDe ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [priceChf, setPriceChf] = useState("");
  const formId = useId();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceRappen = Math.round(Number.parseFloat(priceChf.replace(",", ".")) * 100);
    if (!Number.isFinite(priceRappen) || priceRappen <= 0) return;

    const category = categories.find((c) => c.id === categoryId);
    onSave(buildQuickCaptureInput({ ean, nameDe, categoryId, priceRappen, category, dataSource }));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-primary/50 bg-card p-6"
    >
      <p className="text-sm text-muted-foreground">Schnellerfassung — Details später im Arbeitsvorrat ergänzen.</p>
      {ean && <p className="font-numeric text-sm text-muted-foreground">{ean}</p>}

      <div className="grid grid-cols-2 gap-4">
        <label htmlFor={`${formId}-nameDe`} className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Name (Deutsch)</span>
          <input
            id={`${formId}-nameDe`}
            autoFocus
            required
            value={nameDe}
            onChange={(e) => setNameDe(e.target.value)}
            className={inputClass()}
          />
        </label>

        <label htmlFor={`${formId}-category`} className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Kategorie</span>
          <select
            id={`${formId}-category`}
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass()}
          >
            <option value="" disabled>
              Wählen …
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentName ? `${category.parentName} · ${category.name}` : category.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={`${formId}-price`} className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Preis (CHF)</span>
          <input
            id={`${formId}-price`}
            required
            inputMode="decimal"
            value={priceChf}
            onChange={(e) => setPriceChf(e.target.value)}
            className={inputClass() + " font-numeric"}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="h-14 px-6 text-base" disabled={saving}>
          {saving ? "Speichert …" : "Schnell speichern"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-14 px-6 text-base" onClick={onCancel}>
          Abbrechen
        </Button>
        <p className="text-xs text-muted-foreground">Enter = Speichern · Esc = Abbrechen</p>
      </div>
    </form>
  );
}
