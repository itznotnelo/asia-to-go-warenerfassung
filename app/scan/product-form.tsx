"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductFieldset } from "@/components/product-fieldset";
import type { DataSource } from "@/lib/generated/prisma/client";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import { duplicatedFieldsFromLastSaved, EMPTY_VALUES, type FormValues } from "./product-form-helpers";

export type { FormValues } from "./product-form-helpers";
export { mappedOffToFormValues, suggestVatRate } from "./product-form-helpers";

interface ProductFormProps {
  ean: string | null;
  categories: CategoryOption[];
  initial?: Partial<FormValues>;
  sourced?: Set<keyof FormValues>;
  /** Zuletzt gespeicherter Artikel, für Ctrl+D (Variante derselben Marke). */
  lastSaved?: SaveProductInput;
  dataSource: DataSource;
  onSave: (input: SaveProductInput) => void;
  onCancel: () => void;
  saving: boolean;
}

export function ProductForm({ ean, categories, initial, sourced, lastSaved, dataSource, onSave, onCancel, saving }: ProductFormProps) {
  const [values, setValues] = useState<FormValues>({ ...EMPTY_VALUES, ...initial });
  const formId = useId();

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceRappen = Math.round(Number.parseFloat(values.priceChf.replace(",", ".")) * 100);
    const input: SaveProductInput = {
      ean,
      nameDe: values.nameDe,
      nameOriginal: values.nameOriginal || undefined,
      brand: values.brand || undefined,
      originCountry: values.originCountry || undefined,
      categoryId: values.categoryId,
      priceRappen,
      vatRate: values.vatRate,
      unitType: values.unitType,
      contentAmount: values.contentAmount ? Number.parseFloat(values.contentAmount.replace(",", ".")) : undefined,
      contentUnit: values.contentUnit || undefined,
      storageType: values.storageType,
      ingredientsDe: values.ingredientsDe || undefined,
      allergens: values.allergens,
      notes: values.notes || undefined,
      dataSource,
    };
    onSave(input);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (lastSaved) {
        setValues((prev) => ({ ...prev, ...duplicatedFieldsFromLastSaved(lastSaved) }));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      {ean && <p className="font-numeric text-sm text-muted-foreground">{ean}</p>}

      <ProductFieldset formId={formId} values={values} onChange={update} categories={categories} sourced={sourced} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="h-14 px-6 text-base" disabled={saving}>
          {saving ? "Speichert …" : "Speichern"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-14 px-6 text-base" onClick={onCancel}>
          Abbrechen
        </Button>
        <p className="text-xs text-muted-foreground">Enter = Speichern · Esc = Abbrechen · Tab = nächstes Feld</p>
      </div>
    </form>
  );
}
