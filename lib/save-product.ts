import "server-only";
import { z } from "zod";
import type { Prisma, Product } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { computeDataComplete, productInputSchema } from "@/lib/product-schema";
import { attachOffImages, type OffImageUrls } from "@/lib/off-images";
import { enqueueProductSync } from "@/lib/sync/outbox";
import { triggerBackgroundDrain } from "@/lib/sync/runner";
import { CATEGORY_ERROR, isAssignableCategory } from "@/lib/category-guard";
import { SAVE_FAILED, type SaveFailure } from "@/lib/save-error";

export const DUPLICATE_EAN_ERROR = "Dieser Barcode ist bereits erfasst.";
export const PRODUCT_NOT_FOUND = "Artikel nicht gefunden.";

export type SaveProductResult = { ok: true; product: ProductSummary } | SaveFailure;

// Duck-typed so it works with the generated client's error class without importing it here.
function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
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

/**
 * A unique violation is either the EAN (same article saved twice) or a SKU
 * race between two saves; the SKU case gets one retry with a fresh number.
 */
async function insertWithFreshSku(data: Omit<Prisma.ProductUncheckedCreateInput, "sku">): Promise<Product | SaveFailure> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.product.create({ data: { ...data, sku: await generateNextSku() } });
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) throw error;
      if (data.ean && (await prisma.product.findUnique({ where: { ean: data.ean }, select: { id: true } }))) {
        return { ok: false, message: DUPLICATE_EAN_ERROR, fieldErrors: { ean: [DUPLICATE_EAN_ERROR] } };
      }
      if (attempt >= 1) return { ok: false, message: SAVE_FAILED };
    }
  }
}

export async function createProduct(rawInput: unknown, offImageUrls?: OffImageUrls): Promise<SaveProductResult> {
  const parsed = productInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;
  if (!(await isAssignableCategory(input.categoryId))) {
    return { ok: false, message: CATEGORY_ERROR, fieldErrors: { categoryId: [CATEGORY_ERROR] } };
  }

  const dataComplete = computeDataComplete(input, false);
  const data = {
    ean: input.ean || null,
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
  };

  const created = await insertWithFreshSku(data);
  if ("ok" in created) return created;
  let product = created;

  // Best effort: OFF-Bilder herunterladen, wenn welche mitkamen. Ein
  // Download-Fehler darf den bereits erfolgreichen Save nicht rückgängig
  // machen — deshalb erst nach dem create(), separat vom Haupt-Flow.
  if (offImageUrls?.front || offImageUrls?.ingredients || offImageUrls?.nutrition) {
    const attached = await attachOffImages(product.id, product.sku, offImageUrls);
    if (attached > 0) {
      product = await prisma.product.update({
        where: { id: product.id },
        data: { dataComplete: computeDataComplete(input, true) },
      });
    }
  }

  // Ticket #1369: neu erfasste Artikel landen genauso in der Sync-Outbox wie
  // bearbeitete (meist als "delete"-Op, weil frisch erfasste Artikel ohne
  // eigenes Foto noch unvollständig sind - harmlos, siehe lib/sync/build-ops.ts).
  await enqueueProductSync(product.id);
  triggerBackgroundDrain();

  return { ok: true, product: toProductSummary(product) };
}

const quickUpdateSchema = z.object({
  id: z.string().min(1),
  priceRappen: z.number().int().positive(),
  isAvailable: z.boolean(),
});

/** Der <5s-Pfad für einen bereits erfassten Artikel: nur Preis und Verfügbarkeit. */
export async function applyQuickUpdate(rawInput: unknown): Promise<SaveProductResult> {
  const parsed = quickUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen." };
  }
  const { id, priceRappen, isAvailable } = parsed.data;
  let product: Product;
  try {
    product = await prisma.product.update({ where: { id }, data: { priceRappen, isAvailable } });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) return { ok: false, message: PRODUCT_NOT_FOUND };
    throw error;
  }

  await enqueueProductSync(id);
  triggerBackgroundDrain();

  return { ok: true, product: toProductSummary(product) };
}
