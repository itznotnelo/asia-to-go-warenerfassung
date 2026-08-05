"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALLERGEN_KEYS, ALLERGEN_LABELS } from "@/lib/allergens";
import type { ContentUnit, DataSource, StorageType, UnitType } from "@/lib/generated/prisma/client";
import type { CategoryOption, SaveProductInput } from "./actions";
import { duplicatedFieldsFromLastSaved, EMPTY_VALUES, suggestVatRate, type FormValues } from "./product-form-helpers";

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
  const sourcedFields = sourced ?? new Set<keyof FormValues>();

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleCategoryChange(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    setValues((prev) => ({ ...prev, categoryId, vatRate: suggestVatRate(category) }));
  }

  function toggleAllergen(key: string) {
    setValues((prev) => ({
      ...prev,
      allergens: prev.allergens.includes(key) ? prev.allergens.filter((a) => a !== key) : [...prev.allergens, key],
    }));
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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Name (Deutsch)" sourced={sourcedFields.has("nameDe")} htmlFor={`${formId}-nameDe`}>
          <input
            id={`${formId}-nameDe`}
            autoFocus
            required
            value={values.nameDe}
            onChange={(e) => update("nameDe", e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Originalname" sourced={sourcedFields.has("nameOriginal")} htmlFor={`${formId}-nameOriginal`}>
          <input
            id={`${formId}-nameOriginal`}
            value={values.nameOriginal}
            onChange={(e) => update("nameOriginal", e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Marke" sourced={sourcedFields.has("brand")} htmlFor={`${formId}-brand`}>
          <input id={`${formId}-brand`} value={values.brand} onChange={(e) => update("brand", e.target.value)} className={inputClass()} />
        </Field>

        <Field label="Herkunft (ISO-2)" sourced={sourcedFields.has("originCountry")} htmlFor={`${formId}-origin`}>
          <input
            id={`${formId}-origin`}
            value={values.originCountry}
            onChange={(e) => update("originCountry", e.target.value.toUpperCase())}
            maxLength={2}
            className={cn(inputClass(), "font-numeric uppercase")}
          />
        </Field>

        <Field label="Kategorie" htmlFor={`${formId}-category`}>
          <select
            id={`${formId}-category`}
            required
            value={values.categoryId}
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
        </Field>

        <Field label="MwSt-Satz" htmlFor={`${formId}-vat`}>
          <select
            id={`${formId}-vat`}
            value={values.vatRate}
            onChange={(e) => update("vatRate", Number(e.target.value))}
            className={cn(inputClass(), "font-numeric")}
          >
            <option value={2.6}>2.6 %</option>
            <option value={8.1}>8.1 %</option>
          </select>
        </Field>

        <Field label="Preis (CHF)" htmlFor={`${formId}-price`}>
          <input
            id={`${formId}-price`}
            required
            inputMode="decimal"
            value={values.priceChf}
            onChange={(e) => update("priceChf", e.target.value)}
            className={cn(inputClass(), "font-numeric")}
          />
        </Field>

        <Field label="Verkaufseinheit" htmlFor={`${formId}-unitType`}>
          <select
            id={`${formId}-unitType`}
            value={values.unitType}
            onChange={(e) => update("unitType", e.target.value as UnitType)}
            className={inputClass()}
          >
            <option value="piece">Stück</option>
            <option value="weight">Gewicht</option>
            <option value="volume">Volumen</option>
          </select>
        </Field>

        <Field label="Inhaltsmenge" sourced={sourcedFields.has("contentAmount")} htmlFor={`${formId}-amount`}>
          <input
            id={`${formId}-amount`}
            inputMode="decimal"
            value={values.contentAmount}
            onChange={(e) => update("contentAmount", e.target.value)}
            className={cn(inputClass(), "font-numeric")}
          />
        </Field>

        <Field label="Einheit" sourced={sourcedFields.has("contentUnit")} htmlFor={`${formId}-unit`}>
          <select
            id={`${formId}-unit`}
            value={values.contentUnit}
            onChange={(e) => update("contentUnit", e.target.value as ContentUnit | "")}
            className={inputClass()}
          >
            <option value="">—</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="stk">Stk</option>
          </select>
        </Field>

        <Field label="Lagerung" htmlFor={`${formId}-storage`}>
          <select
            id={`${formId}-storage`}
            value={values.storageType}
            onChange={(e) => update("storageType", e.target.value as StorageType)}
            className={inputClass()}
          >
            <option value="ambient">Trocken</option>
            <option value="chilled">Gekühlt</option>
            <option value="frozen">Tiefgekühlt</option>
          </select>
        </Field>
      </div>

      <Field label="Zutaten (Deutsch)" sourced={sourcedFields.has("ingredientsDe")} htmlFor={`${formId}-ingredients`}>
        <textarea
          id={`${formId}-ingredients`}
          rows={2}
          value={values.ingredientsDe}
          onChange={(e) => update("ingredientsDe", e.target.value)}
          className={cn(inputClass(), "h-auto resize-y py-2")}
        />
      </Field>

      <div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          Allergene
          {sourcedFields.has("allergens") && <SourcedBadge />}
          <span className="text-xs">— vom Nutzer zu prüfen, nie ungeprüft übernehmen</span>
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALLERGEN_KEYS.map((key) => {
            const active = values.allergens.includes(key);
            return (
              <button
                type="button"
                key={key}
                onClick={() => toggleAllergen(key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {ALLERGEN_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Notiz (intern)" htmlFor={`${formId}-notes`}>
        <input id={`${formId}-notes`} value={values.notes} onChange={(e) => update("notes", e.target.value)} className={inputClass()} />
      </Field>

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

function inputClass() {
  return "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

function SourcedBadge() {
  return (
    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-primary uppercase">OFF</span>
  );
}

function Field({
  label,
  htmlFor,
  sourced,
  children,
}: {
  label: string;
  htmlFor: string;
  sourced?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        {sourced && <SourcedBadge />}
      </span>
      {children}
    </label>
  );
}
