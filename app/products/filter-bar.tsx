import Link from "next/link";
import { inputClass } from "@/lib/input-class";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductListFilters } from "./query";

/** Reines GET-Formular — Filtern läuft über die URL, kein Client-JS nötig. */
export function ProductsFilterBar({ categories, filters }: { categories: CategoryOption[]; filters: ProductListFilters }) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Suche</span>
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Name, Original, SKU, EAN …"
          className={inputClass() + " w-56"}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Kategorie</span>
        <select name="category" defaultValue={filters.categoryId ?? ""} className={inputClass() + " w-auto"}>
          <option value="">Alle</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.parentName ? `${category.parentName} · ${category.name}` : category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Lagerung</span>
        <select name="storage" defaultValue={filters.storageType ?? ""} className={inputClass() + " w-auto"}>
          <option value="">Alle</option>
          <option value="ambient">Trocken</option>
          <option value="chilled">Gekühlt</option>
          <option value="frozen">Tiefgekühlt</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Quelle</span>
        <select name="source" defaultValue={filters.dataSource ?? ""} className={inputClass() + " w-auto"}>
          <option value="">Alle</option>
          <option value="openfoodfacts">Open Food Facts</option>
          <option value="manual">Manuell</option>
          <option value="ai_extracted">KI-Extraktion</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Vollständigkeit</span>
        <select name="complete" defaultValue={filters.complete ?? ""} className={inputClass() + " w-auto"}>
          <option value="">Alle</option>
          <option value="true">Vollständig</option>
          <option value="false">Unvollständig</option>
        </select>
      </label>

      <button type="submit" className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80">
        Filtern
      </button>
      <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
        Zurücksetzen
      </Link>
    </form>
  );
}
