"use server";

import { prisma } from "@/lib/prisma";
import { isValidBarcode, normalizeGtin } from "@/lib/barcode";
import { fetchOffProduct } from "@/lib/openfoodfacts/client";
import { mapOffToProduct } from "@/lib/openfoodfacts/mapping";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import type { OffImageUrls } from "@/lib/off-images";
import { applyQuickUpdate, createProduct, type SaveProductResult } from "@/lib/save-product";
import type { CategoryOption } from "@/lib/category-option";
import type { LookupResult } from "@/lib/lookup-result";

// Next.js erlaubt in "use server"-Dateien ausschliesslich async-Function-Exports —
// auch `export type` scheitert daran (siehe lib/category-option.ts,
// lib/product-summary.ts, lib/lookup-result.ts, lib/product-schema.ts für die
// eigentlichen Typdefinitionen; hier nur noch lokale, nicht exportierte Aliase).

/** Nur Unterkategorien sind wählbar — die Top-Level-Einträge sind reine Gruppenüberschriften. */
export async function getCategories(): Promise<CategoryOption[]> {
  const categories = await prisma.category.findMany({ include: { parent: true } });
  return categories
    .filter((category) => category.parent !== null)
    .sort((a, b) => a.parent!.sortOrder - b.parent!.sortOrder || a.sortOrder - b.sortOrder)
    .map((category) => ({
      id: category.id,
      name: category.name,
      parentName: category.parent?.name ?? null,
      slug: category.slug,
      parentSlug: category.parent?.slug ?? null,
    }));
}

async function logScan(ean: string, result: "existing_product" | "off_hit" | "off_miss", productId: string | null) {
  await prisma.scanLog.create({ data: { ean, result, productId } });
}

/**
 * Eigene DB zuerst, dann Open Food Facts. Jeder gültige Scan landet im
 * ScanLog — das ist die einzige Quelle für die OFF-Trefferquote im
 * Dashboard, deshalb hier und nicht erst beim Speichern loggen.
 */
export async function lookupBarcode(rawBarcode: string): Promise<LookupResult> {
  const barcode = normalizeGtin(rawBarcode);
  if (!barcode || !isValidBarcode(barcode)) {
    return { kind: "off-error", ean: rawBarcode };
  }

  const existing = await prisma.product.findUnique({ where: { ean: barcode } });
  if (existing) {
    await logScan(barcode, "existing_product", existing.id);
    return { kind: existing.archivedAt ? "archived" : "existing", product: toProductSummary(existing) };
  }

  const lookup = await fetchOffProduct(barcode);
  if (lookup.error) {
    return { kind: "off-error", ean: barcode };
  }
  if (lookup.found && lookup.product) {
    await logScan(barcode, "off_hit", null);
    return { kind: "off-hit", ean: barcode, mapped: mapOffToProduct(lookup.product) };
  }

  await logScan(barcode, "off_miss", null);
  return { kind: "off-miss", ean: barcode };
}

/** Neuer Artikel vom Scan-Bildschirm, Logik in lib/save-product.ts. */
export async function saveProduct(rawInput: unknown, offImageUrls?: OffImageUrls): Promise<SaveProductResult> {
  return createProduct(rawInput, offImageUrls);
}

/** Der <5s-Pfad für einen bereits erfassten Artikel: nur Preis und Verfügbarkeit. */
export async function quickUpdateProduct(rawInput: unknown): Promise<SaveProductResult> {
  return applyQuickUpdate(rawInput);
}

/** Für Ctrl+K — springt direkt in die Schnellansicht eines bestehenden Artikels. */
export async function searchProducts(query: string): Promise<ProductSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const products = await prisma.product.findMany({
    where: {
      archivedAt: null,
      OR: [
        { nameDe: { contains: trimmed, mode: "insensitive" } },
        { nameOriginal: { contains: trimmed, mode: "insensitive" } },
        { sku: { contains: trimmed, mode: "insensitive" } },
        { ean: { contains: trimmed } },
      ],
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
  return products.map(toProductSummary);
}
