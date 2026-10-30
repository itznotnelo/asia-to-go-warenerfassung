"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductFieldset } from "@/components/product-fieldset";
import { SaveErrorBox } from "@/components/save-error-box";
import { inputClass } from "@/lib/input-class";
import { saveErrorLines, settle } from "@/lib/save-error";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import type { ProductSummary } from "@/lib/product-summary";
import {
  parseFormNumbers,
  productSummaryToFormValues,
  type FormValues,
  type NumberFieldErrors,
} from "@/app/scan/product-form-helpers";
import { deleteProduct, updateProduct } from "../actions";

export function ProductEditForm({ product, categories }: { product: ProductSummary; categories: CategoryOption[] }) {
  const router = useRouter();
  const formId = useId();
  const [values, setValues] = useState<FormValues>(() => productSummaryToFormValues(product));
  const [ean, setEan] = useState(product.ean ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<NumberFieldErrors>({});
  const [saveError, setSaveError] = useState<string[] | null>(null);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSaveError(null);
    const parsed = parseFormNumbers(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaving(true);

    const { priceRappen, contentAmount } = parsed;
    const input: SaveProductInput = {
      ean: ean.trim() || null,
      nameDe: values.nameDe,
      nameOriginal: values.nameOriginal || undefined,
      brand: values.brand || undefined,
      originCountry: values.originCountry || undefined,
      categoryId: values.categoryId,
      priceRappen,
      vatRate: values.vatRate,
      unitType: values.unitType,
      contentAmount,
      contentUnit: values.contentUnit || undefined,
      storageType: values.storageType,
      ingredientsDe: values.ingredientsDe || undefined,
      allergens: values.allergens,
      traces: values.traces,
      allergensConfirmed: values.allergensConfirmed,
      notes: values.notes || undefined,
      dataSource: product.dataSource,
    };

    const result = await settle(() => updateProduct({ id: product.id, ...input }));
    setSaving(false);
    if (!result.ok) {
      setSaveError(saveErrorLines(result));
      return;
    }
    setMessage("Gespeichert.");
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`„${product.nameDe}" wirklich löschen?`)) return;
    setDeleting(true);
    setMessage(null);
    setSaveError(null);
    const result = await settle(() => deleteProduct(product.id));
    if (result.ok) {
      router.push("/products");
    } else {
      setDeleting(false);
      setSaveError(saveErrorLines(result));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="font-numeric text-sm text-muted-foreground">{product.sku}</p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">EAN</span>
        <input value={ean} onChange={(e) => setEan(e.target.value)} className={inputClass() + " font-numeric"} />
      </label>

      <ProductFieldset formId={formId} values={values} onChange={update} categories={categories} autoFocusName={false} errors={errors} />

      <SaveErrorBox lines={saveError} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="h-14 px-6 text-base" disabled={saving}>
          {saving ? "Speichert …" : "Speichern"}
        </Button>
        <Button type="button" variant="destructive" size="lg" className="h-14 px-6 text-base" disabled={deleting} onClick={handleDelete}>
          {deleting ? "Löscht …" : "Löschen"}
        </Button>
        <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück zur Liste
        </Link>
      </div>
    </form>
  );
}
