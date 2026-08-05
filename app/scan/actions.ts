"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasValidBarcodeFormat } from "@/lib/barcode";
import { fetchOffProduct } from "@/lib/openfoodfacts/client";
import { mapOffToProduct } from "@/lib/openfoodfacts/mapping";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { computeDataComplete, productInputSchema } from "@/lib/product-schema";
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
    .map((category) => ({ id: category.id, name: category.name, parentName: category.parent?.name ?? null }));
}

async function logScan(ean: string, result: "existing_product" | "off_hit" | "off_miss", productId: string | null) {
  await prisma.scanLog.create({ data: { ean, result, productId } });
}

/**
 * Eigene DB zuerst, dann Open Food Facts. Jeder gültige Scan landet im
 * ScanLog — das ist die einzige Quelle für die OFF-Trefferquote im
 * Dashboard, deshalb hier und nicht erst beim Speichern loggen.
 */
export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  if (!hasValidBarcodeFormat(barcode)) {
    return { kind: "off-error", ean: barcode };
  }

  const existing = await prisma.product.findUnique({ where: { ean: barcode } });
  if (existing) {
    await logScan(barcode, "existing_product", existing.id);
    return { kind: "existing", product: toProductSummary(existing) };
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

/** Fortlaufende SKU nach dem letzten vergebenen Wert, nicht nach Artikelanzahl (bleibt stabil, wenn Artikel gelöscht werden). */
async function generateNextSku(): Promise<string> {
  const last = await prisma.product.findFirst({
    where: { sku: { startsWith: "ASIA-" } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const lastNumber = last ? Number(last.sku.slice("ASIA-".length)) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `ASIA-${String(next).padStart(5, "0")}`;
}

type SaveProductResult =
  | { ok: true; product: ProductSummary }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

export async function saveProduct(rawInput: unknown): Promise<SaveProductResult> {
  const parsed = productInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const sku = await generateNextSku();
  const dataComplete = computeDataComplete(input, false);

  const product = await prisma.product.create({
    data: {
      ean: input.ean || null,
      sku,
      nameDe: input.nameDe,
      nameOriginal: input.nameOriginal || null,
      brand: input.brand || null,
      originCountry: input.originCountry || null,
      categoryId: input.categoryId,
      priceRappen: input.priceRappen,
      vatRate: input.vatRate,
      unitType: input.unitType,
      contentAmount: input.contentAmount ?? null,
      contentUnit: input.contentUnit ?? null,
      storageType: input.storageType,
      ingredientsDe: input.ingredientsDe || null,
      allergens: input.allergens,
      notes: input.notes || null,
      dataSource: input.dataSource,
      dataComplete,
    },
  });

  return { ok: true, product: toProductSummary(product) };
}

const quickUpdateSchema = z.object({
  id: z.string().min(1),
  priceRappen: z.number().int().positive(),
  isAvailable: z.boolean(),
});

/** Der <5s-Pfad für einen bereits erfassten Artikel: nur Preis und Verfügbarkeit. */
export async function quickUpdateProduct(
  rawInput: unknown,
): Promise<{ ok: true; product: ProductSummary } | { ok: false; message: string }> {
  const parsed = quickUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen." };
  }
  const { id, priceRappen, isAvailable } = parsed.data;
  const product = await prisma.product.update({ where: { id }, data: { priceRappen, isAvailable } });
  return { ok: true, product: toProductSummary(product) };
}

/** Für Ctrl+K — springt direkt in die Schnellansicht eines bestehenden Artikels. */
export async function searchProducts(query: string): Promise<ProductSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const products = await prisma.product.findMany({
    where: {
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
