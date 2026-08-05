"use client";

import { cn } from "@/lib/utils";
import { ALLERGEN_KEYS, ALLERGEN_LABELS } from "@/lib/allergens";
import { inputClass } from "@/lib/input-class";
import type { ContentUnit, StorageType, UnitType } from "@/lib/generated/prisma/client";
import type { CategoryOption } from "@/lib/category-option";
import { suggestVatRate, type FormValues } from "@/app/scan/product-form-helpers";

interface ProductFieldsetProps {
  formId: string;
  values: FormValues;
  onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  categories: CategoryOption[];
  /** Felder, die von OFF übernommen wurden — bekommt ein sichtbares "OFF"-Badge. Nur im /scan-Kontext relevant. */
  sourced?: Set<keyof FormValues>;
  autoFocusName?: boolean;
}

/**
 * Die editierbaren Produktfelder, geteilt zwischen dem Neuanlage-Formular in
 * /scan und der Detailseite in /products/[id] — beide bearbeiten dasselbe
 * Produktschema, nur Drumherum (Speichern-Semantik, Ctrl+D, Löschen) unterscheidet sich.
 */
export function ProductFieldset({ formId, values, onChange, categories, sourced, autoFocusName = true }: ProductFieldsetProps) {
  const sourcedFields = sourced ?? new Set<keyof FormValues>();

  function handleCategoryChange(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    onChange("categoryId", categoryId);
    onChange("vatRate", suggestVatRate(category));
  }

  function toggleAllergen(key: string) {
    onChange("allergens", values.allergens.includes(key) ? values.allergens.filter((a) => a !== key) : [...values.allergens, key]);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name (Deutsch)" sourced={sourcedFields.has("nameDe")} htmlFor={`${formId}-nameDe`}>
          <input
            id={`${formId}-nameDe`}
            autoFocus={autoFocusName}
            required
            value={values.nameDe}
            onChange={(e) => onChange("nameDe", e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Originalname" sourced={sourcedFields.has("nameOriginal")} htmlFor={`${formId}-nameOriginal`}>
          <input
            id={`${formId}-nameOriginal`}
            value={values.nameOriginal}
            onChange={(e) => onChange("nameOriginal", e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Marke" sourced={sourcedFields.has("brand")} htmlFor={`${formId}-brand`}>
          <input
            id={`${formId}-brand`}
            value={values.brand}
            onChange={(e) => onChange("brand", e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Herkunft (ISO-2)" sourced={sourcedFields.has("originCountry")} htmlFor={`${formId}-origin`}>
          <input
            id={`${formId}-origin`}
            value={values.originCountry}
            onChange={(e) => onChange("originCountry", e.target.value.toUpperCase())}
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
            onChange={(e) => onChange("vatRate", Number(e.target.value))}
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
            onChange={(e) => onChange("priceChf", e.target.value)}
            className={cn(inputClass(), "font-numeric")}
          />
        </Field>

        <Field label="Verkaufseinheit" htmlFor={`${formId}-unitType`}>
          <select
            id={`${formId}-unitType`}
            value={values.unitType}
            onChange={(e) => onChange("unitType", e.target.value as UnitType)}
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
            onChange={(e) => onChange("contentAmount", e.target.value)}
            className={cn(inputClass(), "font-numeric")}
          />
        </Field>

        <Field label="Einheit" sourced={sourcedFields.has("contentUnit")} htmlFor={`${formId}-unit`}>
          <select
            id={`${formId}-unit`}
            value={values.contentUnit}
            onChange={(e) => onChange("contentUnit", e.target.value as ContentUnit | "")}
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
            onChange={(e) => onChange("storageType", e.target.value as StorageType)}
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
          onChange={(e) => onChange("ingredientsDe", e.target.value)}
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
        <input
          id={`${formId}-notes`}
          value={values.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          className={inputClass()}
        />
      </Field>
    </>
  );
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
