"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { VatSelect } from "@/components/product-fieldset";
import { SaveErrorBox } from "@/components/save-error-box";
import { inputClass } from "@/lib/input-class";
import { parseChfToRappen, PRICE_ERROR } from "@/lib/pricing";
import type { CategoryOption } from "@/lib/category-option";
import type { DataSource } from "@/lib/generated/prisma/client";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import { buildQuickCaptureInput, CAPTURE_FORM_ID, isQuickCaptureDirty, suggestVatRate, vatAfterCategoryChange } from "./product-form-helpers";
import { useReportDirty } from "./use-report-dirty";

interface QuickCaptureFormProps {
  ean: string | null;
  categories: CategoryOption[];
  initialNameDe?: string;
  dataSource: DataSource;
  onSave: (input: SaveProductInput) => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string[] | null;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Zwei-Pass-Modus: nur Name + Kategorie + Preis + MwSt, sofort weiter zum nächsten
 * Scan. Der Artikel landet unvollständig im Arbeitsvorrat (/dashboard) —
 * Details kommen später am Schreibtisch über /products/[id].
 */
export function QuickCaptureForm({
  ean,
  categories,
  initialNameDe,
  dataSource,
  onSave,
  onCancel,
  saving,
  saveError,
  onDirtyChange,
}: QuickCaptureFormProps) {
  const [nameDe, setNameDe] = useState(initialNameDe ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [priceChf, setPriceChf] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [vatRate, setVatRate] = useState(() => suggestVatRate(undefined));
  const [vatTouched, setVatTouched] = useState(false);
  const formId = useId();
  useReportDirty(isQuickCaptureDirty({ nameDe, categoryId, priceChf, vatTouched }, initialNameDe ?? ""), onDirtyChange);

  function handleCategoryChange(nextId: string) {
    setCategoryId(nextId);
    setVatRate(vatAfterCategoryChange(vatRate, vatTouched, categories.find((c) => c.id === nextId)).vatRate);
  }

  function handleVatChange(rate: number) {
    setVatTouched(true);
    setVatRate(rate);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceRappen = parseChfToRappen(priceChf);
    if (priceRappen === null || priceRappen <= 0) {
      setPriceError(PRICE_ERROR);
      return;
    }
    setPriceError(null);

    onSave(buildQuickCaptureInput({ ean, nameDe, categoryId, priceRappen, vatRate, dataSource }));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      id={CAPTURE_FORM_ID}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-primary/50 bg-card p-6"
    >
      <p className="text-sm text-muted-foreground">Schnellerfassung: Details später unter «Noch unvollständig» ergänzen.</p>
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
            onChange={(e) => handleCategoryChange(e.target.value)}
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
            aria-invalid={priceError !== null}
            className={inputClass() + " font-numeric"}
          />
          {priceError && <span role="alert" className="text-sm text-destructive">{priceError}</span>}
        </label>

        <label htmlFor={`${formId}-vat`} className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">MwSt-Satz</span>
          <VatSelect id={`${formId}-vat`} value={vatRate} onChange={handleVatChange} />
        </label>
      </div>

      <SaveErrorBox lines={saveError} />

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
