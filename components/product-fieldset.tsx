"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ALLERGEN_KEYS, ALLERGEN_LABELS } from "@/lib/allergens";
import { allOtherCountries, COMMON_ORIGINS, isKnownCountryCode } from "@/lib/countries";
import { inputClass } from "@/lib/input-class";
import type { ContentUnit, StorageType, UnitType } from "@/lib/generated/prisma/client";
import type { CategoryOption } from "@/lib/category-option";
import { KIND_OPTIONS, suggestKind, type ProductKind } from "@/lib/product-kind";
import {
  VAT_OPTIONS,
  vatAfterCategoryChange,
  type FormValues,
  type NumberFieldErrors,
} from "@/app/scan/product-form-helpers";

interface ProductFieldsetProps {
  formId: string;
  values: FormValues;
  onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  categories: CategoryOption[];
  /** Felder, die von OFF übernommen wurden: bekommen ein sichtbares "online"-Badge. Nur im /scan-Kontext relevant. */
  sourced?: Set<keyof FormValues>;
  autoFocusName?: boolean;
  /** Feldmeldungen aus parseFormNumbers(), erscheinen unter Preis bzw. Inhaltsmenge. */
  errors?: NumberFieldErrors;
  /**
   * True on the edit page: the stored rate counts as chosen, so a category change
   * only shows a hint instead of overwriting it. New products start untouched.
   */
  vatTouchedInitially?: boolean;
  /**
   * Warenart (#27). Only the edit page passes it; without it the select is hidden and
   * the server takes the category's kind. A category change resets it to that kind.
   */
  kind?: ProductKind;
  onKindChange?: (kind: ProductKind) => void;
}

/**
 * Die editierbaren Produktfelder, geteilt zwischen dem Neuanlage-Formular in
 * /scan und der Detailseite in /products/[id] — beide bearbeiten dasselbe
 * Produktschema, nur Drumherum (Speichern-Semantik, Ctrl+D, Löschen) unterscheidet sich.
 */
export function ProductFieldset({
  formId,
  values,
  onChange,
  categories,
  sourced,
  autoFocusName = true,
  errors = {},
  vatTouchedInitially = false,
  kind,
  onKindChange,
}: ProductFieldsetProps) {
  const sourcedFields = sourced ?? new Set<keyof FormValues>();
  const [vatTouched, setVatTouched] = useState(vatTouchedInitially);
  const [suggestedVat, setSuggestedVat] = useState<number | null>(null);

  function handleCategoryChange(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    const next = vatAfterCategoryChange(values.vatRate, vatTouched, category);
    onChange("categoryId", categoryId);
    onChange("vatRate", next.vatRate);
    setSuggestedVat(next.suggested);
    onKindChange?.(suggestKind(category));
  }

  function handleVatChange(rate: number) {
    setVatTouched(true);
    setSuggestedVat(null);
    onChange("vatRate", rate);
  }

  // Any change to the lists voids an earlier "geprüft" tick: the user confirms what is on screen.
  function toggleKey(field: "allergens" | "traces", key: string) {
    const list = values[field];
    onChange(field, list.includes(key) ? list.filter((a) => a !== key) : [...list, key]);
    onChange("allergensConfirmed", false);
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

        <Field label="Herkunftsland" sourced={sourcedFields.has("originCountry")} htmlFor={`${formId}-origin`}>
          <CountrySelect
            id={`${formId}-origin`}
            value={values.originCountry}
            onChange={(code) => onChange("originCountry", code)}
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
          <VatSelect id={`${formId}-vat`} value={values.vatRate} onChange={handleVatChange} />
          {suggestedVat !== null && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              Vorschlag für diese Kategorie: {suggestedVat} %
              <button
                type="button"
                onClick={() => handleVatChange(suggestedVat)}
                className="rounded-sm px-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                Übernehmen
              </button>
            </span>
          )}
        </Field>

        {kind !== undefined && onKindChange && (
          <Field label="Warenart" htmlFor={`${formId}-kind`}>
            <select
              id={`${formId}-kind`}
              value={kind}
              onChange={(e) => onKindChange(e.target.value as ProductKind)}
              className={inputClass()}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Preis (CHF)" htmlFor={`${formId}-price`} error={errors.priceChf}>
          <input
            id={`${formId}-price`}
            required
            inputMode="decimal"
            value={values.priceChf}
            onChange={(e) => onChange("priceChf", e.target.value)}
            aria-invalid={errors.priceChf !== undefined}
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
            <option value="piece">Packung (Preis pro Stück)</option>
            <option value="weight">Offen nach Gewicht (g/kg)</option>
            <option value="volume">Offen nach Volumen (ml/l)</option>
          </select>
        </Field>

        <Field
          label="Inhaltsmenge"
          sourced={sourcedFields.has("contentAmount")}
          htmlFor={`${formId}-amount`}
          error={errors.contentAmount}
        >
          <input
            id={`${formId}-amount`}
            inputMode="decimal"
            value={values.contentAmount}
            onChange={(e) => onChange("contentAmount", e.target.value)}
            aria-invalid={errors.contentAmount !== undefined}
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
            <option value="">Keine Angabe</option>
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

      <AllergenChips
        label="Allergene"
        sourced={sourcedFields.has("allergens")}
        selected={values.allergens}
        onToggle={(key) => toggleKey("allergens", key)}
      />

      <AllergenChips
        label="Kann Spuren enthalten von"
        sourced={sourcedFields.has("traces")}
        selected={values.traces}
        onToggle={(key) => toggleKey("traces", key)}
      />

      <label htmlFor={`${formId}-allergensConfirmed`} className="flex items-start gap-3">
        <input
          id={`${formId}-allergensConfirmed`}
          type="checkbox"
          checked={values.allergensConfirmed}
          onChange={(e) => onChange("allergensConfirmed", e.target.checked)}
          className="mt-0.5 size-5 accent-primary"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Allergene geprüft</span>
          <span className="text-xs text-muted-foreground">
            {values.allergensConfirmed
              ? "Allergene und Spuren stimmen mit der Packung überein."
              : "Mit der Packung vergleichen und abhaken. Ohne Häkchen erscheint der Artikel nicht im Shop."}
          </span>
        </span>
      </label>

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

function AllergenChips({
  label,
  sourced,
  selected,
  onToggle,
}: {
  label: string;
  sourced: boolean;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        {sourced && <SourcedBadge />}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {ALLERGEN_KEYS.map((key) => {
          const active = selected.includes(key);
          return (
            <button
              type="button"
              key={key}
              aria-pressed={active}
              onClick={() => onToggle(key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                active ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {ALLERGEN_LABELS[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SourcedBadge() {
  return (
    <span
      title="Aus der Online-Suche übernommen. Bitte prüfen."
      className="rounded-sm bg-primary/20 px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-primary"
    >
      online
    </span>
  );
}

export function VatSelect({ id, value, onChange }: { id: string; value: number; onChange: (rate: number) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn(inputClass(), "font-numeric")}>
      {VAT_OPTIONS.map((option) => (
        <option key={option.rate} value={option.rate}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const others = useMemo(() => allOtherCountries(), []);
  // A free-text value saved before the dropdown existed (e.g. a typo) stays visible
  // instead of silently turning into "Nicht angegeben".
  const unknown = value !== "" && !isKnownCountryCode(value) ? value : null;

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass()}>
      <option value="">Nicht angegeben</option>
      {unknown && <option value={unknown}>{unknown} (bitte prüfen)</option>}
      <optgroup label="Häufig">
        {COMMON_ORIGINS.map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Alle Länder">
        {others.map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function Field({
  label,
  htmlFor,
  sourced,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  sourced?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        {sourced && <SourcedBadge />}
      </span>
      {children}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
