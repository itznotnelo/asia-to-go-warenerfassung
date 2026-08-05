"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductFieldset } from "@/components/product-fieldset";
import { inputClass } from "@/lib/input-class";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import type { ProductSummary } from "@/lib/product-summary";
import { productSummaryToFormValues, type FormValues } from "@/app/scan/product-form-helpers";
import { deleteProduct, updateProduct } from "../actions";

export function ProductEditForm({ product, categories }: { product: ProductSummary; categories: CategoryOption[] }) {
  const router = useRouter();
  const formId = useId();
  const [values, setValues] = useState<FormValues>(() => productSummaryToFormValues(product));
  const [ean, setEan] = useState(product.ean ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const priceRappen = Math.round(Number.parseFloat(values.priceChf.replace(",", ".")) * 100);
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
      contentAmount: values.contentAmount ? Number.parseFloat(values.contentAmount.replace(",", ".")) : undefined,
      contentUnit: values.contentUnit || undefined,
      storageType: values.storageType,
      ingredientsDe: values.ingredientsDe || undefined,
      allergens: values.allergens,
      notes: values.notes || undefined,
      dataSource: product.dataSource,
    };

    const result = await updateProduct({ id: product.id, ...input });
    setSaving(false);
    setMessage(result.ok ? "Gespeichert." : result.message);
    if (result.ok) router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`„${product.nameDe}" wirklich löschen?`)) return;
    setDeleting(true);
    const result = await deleteProduct(product.id);
    if (result.ok) {
      router.push("/products");
    } else {
      setDeleting(false);
      setMessage(result.message);
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

      <ProductFieldset formId={formId} values={values} onChange={update} categories={categories} autoFocusName={false} />

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
