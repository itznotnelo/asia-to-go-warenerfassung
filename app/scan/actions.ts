"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasValidBarcodeFormat } from "@/lib/barcode";
import { fetchOffProduct } from "@/lib/openfoodfacts/client";
import { mapOffToProduct, type MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type {
  ContentUnit,
  DataSource,
  Prisma,
  Product,
  StorageType,
  UnitType,
} from "@/lib/generated/prisma/client";

export interface ProductSummary {
  id: string;
  sku: string;
  ean: string | null;
  nameDe: string;
  nameOriginal: string | null;
  brand: string | null;
  originCountry: string | null;
  categoryId: string;
  priceRappen: number;
  vatRate: number;
  unitType: UnitType;
  contentAmount: number | null;
  contentUnit: ContentUnit | null;
  storageType: StorageType;
  ingredientsDe: string | null;
  allergens: string[];
  isAvailable: boolean;
  dataSource: DataSource;
  dataComplete: boolean;
  notes: string | null;
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function toProductSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    ean: product.ean,
    nameDe: product.nameDe,
    nameOriginal: product.nameOriginal,
    brand: product.brand,
    originCountry: product.originCountry,
    categoryId: product.categoryId,
    priceRappen: product.priceRappen,
    vatRate: decimalToNumber(product.vatRate) ?? 2.6,
    unitType: product.unitType,
    contentAmount: decimalToNumber(product.contentAmount),
    contentUnit: product.contentUnit,
    storageType: product.storageType,
    ingredientsDe: product.ingredientsDe,
    allergens: product.allergens,
    isAvailable: product.isAvailable,
    dataSource: product.dataSource,
    dataComplete: product.dataComplete,
    notes: product.notes,
  };
}

export interface CategoryOption {
  id: string;
  name: string;
  parentName: string | null;
}

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

export type LookupResult =
  | { kind: "existing"; product: ProductSummary }
  | { kind: "off-hit"; ean: string; mapped: MappedOffProduct }
  | { kind: "off-miss"; ean: string }
  | { kind: "off-error"; ean: string };

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

const saveProductInputSchema = z.object({
  ean: z.string().trim().nullable(),
  nameDe: z.string().trim().min(1, "Name ist Pflicht"),
  nameOriginal: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  originCountry: z.string().trim().length(2).optional(),
  categoryId: z.string().min(1, "Kategorie ist Pflicht"),
  priceRappen: z.number().int().positive("Preis muss positiv sein"),
  vatRate: z.number(),
  unitType: z.enum(["piece", "weight", "volume"]),
  contentAmount: z.number().positive().optional(),
  contentUnit: z.enum(["g", "kg", "ml", "l", "stk"]).optional(),
  storageType: z.enum(["ambient", "chilled", "frozen"]),
  ingredientsDe: z.string().trim().optional(),
  allergens: z.array(z.string()).default([]),
  notes: z.string().trim().optional(),
  dataSource: z.enum(["openfoodfacts", "manual", "ai_extracted"]),
});

export type SaveProductInput = z.infer<typeof saveProductInputSchema>;

// Pflichtfelder für den Shop-Auftritt, siehe .claude/skills/swiss-food-compliance/SKILL.md.
// `hasImage` ist bewusst ein Parameter statt eines DB-Lookups — Phase 2 hat
// noch keinen Bild-Upload, ein neu angelegter Artikel ist also nie komplett.
function computeDataComplete(input: SaveProductInput, hasImage: boolean): boolean {
  return Boolean(
    input.nameDe && input.priceRappen > 0 && input.contentAmount && input.contentUnit && input.ingredientsDe && hasImage,
  );
}

export type SaveProductResult =
  | { ok: true; product: ProductSummary }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

export async function saveProduct(rawInput: unknown): Promise<SaveProductResult> {
  const parsed = saveProductInputSchema.safeParse(rawInput);
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
