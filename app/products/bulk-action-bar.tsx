"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import type { CategoryOption } from "@/lib/category-option";
import type { BulkUpdatePatch } from "@/lib/bulk-update-patch";

interface BulkActionBarProps {
  count: number;
  categories: CategoryOption[];
  onApply: (patch: BulkUpdatePatch) => void;
  disabled: boolean;
}

/** Bulk-Aktionen: Kategorie setzen, MwSt setzen, Verfügbarkeit umschalten — für die aktuell ausgewählten Artikel. */
export function BulkActionBar({ count, categories, onApply, disabled }: BulkActionBarProps) {
  const [categoryId, setCategoryId] = useState("");
  const [vatRate, setVatRate] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
      <span className="text-sm font-medium">{count} ausgewählt</span>

      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass() + " w-auto"}>
        <option value="">Kategorie setzen …</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.parentName ? `${category.parentName} · ${category.name}` : category.name}
          </option>
        ))}
      </select>
      <Button type="button" variant="outline" disabled={disabled || !categoryId} onClick={() => onApply({ categoryId })}>
        Anwenden
      </Button>

      <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={inputClass() + " w-auto"}>
        <option value="">MwSt setzen …</option>
        <option value="2.6">2.6 %</option>
        <option value="8.1">8.1 %</option>
      </select>
      <Button type="button" variant="outline" disabled={disabled || !vatRate} onClick={() => onApply({ vatRate: Number(vatRate) })}>
        Anwenden
      </Button>

      <Button type="button" variant="outline" disabled={disabled} onClick={() => onApply({ isAvailable: true })}>
        Verfügbar setzen
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => onApply({ isAvailable: false })}>
        Nicht verfügbar setzen
      </Button>
    </div>
  );
}
