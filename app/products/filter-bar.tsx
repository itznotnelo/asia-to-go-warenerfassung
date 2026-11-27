import Link from "next/link";
import { inputClass } from "@/lib/input-class";
import { buttonVariants } from "@/components/ui/button-variants";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductListFilters } from "./query";

/** Reines GET-Formular — Filtern läuft über die URL, kein Client-JS nötig. */
export function ProductsFilterBar({ categories, filters }: { categories: CategoryOption[]; filters: ProductListFilters }) {
  return (
    <form method="GET" className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(9.5rem,1.2fr)_auto]">
      <label className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
        <span className="text-sm text-muted-foreground">Suche</span>
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Name, Original, SKU, EAN …"
          type="search"
          className={inputClass()}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Kategorie</span>
        <select name="category" defaultValue={filters.categoryId ?? ""} className={inputClass()}>
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
        <select name="storage" defaultValue={filters.storageType ?? ""} className={inputClass()}>
          <option value="">Alle</option>
          <option value="ambient">Trocken</option>
          <option value="chilled">Gekühlt</option>
          <option value="frozen">Tiefgekühlt</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Quelle</span>
        <select name="source" defaultValue={filters.dataSource ?? ""} className={inputClass()}>
          <option value="">Alle</option>
          <option value="openfoodfacts">Online gefunden</option>
          <option value="manual">Manuell</option>
          <option value="ai_extracted">KI-Extraktion</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Vollständigkeit</span>
        <select name="complete" defaultValue={filters.complete ?? ""} className={inputClass()}>
          <option value="">Alle</option>
          <option value="true">Vollständig</option>
          <option value="false">Unvollständig</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Anzeigen</span>
        <select name="archived" defaultValue={filters.archived ?? ""} className={inputClass()}>
          <option value="">Aktive Artikel</option>
          <option value="true">Gelöschte Artikel</option>
        </select>
      </label>

      <div className="col-span-2 flex items-center gap-1 md:col-span-4 xl:col-span-1">
        {/* Secondary on purpose: the page's one primary action is "Neu erfassen". */}
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Filtern
        </button>
        <Link href="/products" className={buttonVariants({ variant: "ghost" }) + " text-muted-foreground"}>
          Zurücksetzen
        </Link>
      </div>
    </form>
  );
}
