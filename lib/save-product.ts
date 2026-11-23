import "server-only";
import { z } from "zod";
import type { Prisma, Product } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { allergensConfirmedAtFor, computeDataComplete, priceRappenSchema, productInputSchema } from "@/lib/product-schema";
import { attachOffImages, type OffImageUrls } from "@/lib/off-images";
import { enqueueProductSync } from "@/lib/sync/outbox";
import { triggerBackgroundDrain } from "@/lib/sync/runner";
import { assignableCategory, CATEGORY_ERROR } from "@/lib/category-guard";
import { suggestKind } from "@/lib/product-kind";
import { SAVE_FAILED, type SaveFailure } from "@/lib/save-error";

export const DUPLICATE_EAN_ERROR = "Dieser Barcode ist bereits erfasst.";
export const PRODUCT_NOT_FOUND = "Artikel nicht gefunden.";

export type SaveProductResult = { ok: true; product: ProductSummary } | SaveFailure;

// Duck-typed so it works with the generated client's error class without importing it here.
function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function formatSku(value: number): string {
  return `ASIA-${String(value).padStart(5, "0")}`;
}

/**
 * Fortlaufende SKU aus der SkuCounter-Zeile, in derselben Transaktion wie das
 * create(): nie aus vorhandenen Artikeln abgeleitet, also wird die SKU eines
 * gelöschten Artikels nie neu vergeben. Das UPDATE sperrt die Zeile, ein
 * paralleler Save wartet bis zum Commit und bekommt die nächste Nummer. Ein
 * Rollback nimmt die Nummer mit zurück, es entstehen keine Lücken.
 */
async function createWithNextSku(data: Omit<Prisma.ProductUncheckedCreateInput, "sku">): Promise<Product> {
  return prisma.$transaction(async (tx) => {
    const counter = await tx.skuCounter.upsert({
      where: { id: 1 },
      create: { id: 1, value: 1 },
      update: { value: { increment: 1 } },
    });
    return tx.product.create({ data: { ...data, sku: formatSku(counter.value) } });
  });
}

/**
 * Safety net if the counter is ever behind the products table (row missing,
 * an ASIA-xxxxx SKU written outside the app): move it to the highest issued
 * number. Numeric max, text order would put ASIA-100000 before ASIA-99999.
 * GREATEST, so it never moves backwards.
 */
async function resyncSkuCounter(): Promise<void> {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("sku" FROM 6) AS INTEGER)) AS "max"
    FROM "Product" WHERE "sku" ~ '^ASIA-[0-9]{1,9}$'`;
  const highest = rows[0]?.max ?? 0;
  await prisma.$executeRaw`
    INSERT INTO "SkuCounter" ("id", "value") VALUES (1, ${highest})
    ON CONFLICT ("id") DO UPDATE SET "value" = GREATEST("SkuCounter"."value", EXCLUDED."value")`;
}

/**
 * A unique violation is either the EAN (same article saved twice) or a SKU
 * that already exists because the counter fell behind; the SKU case resyncs
 * the counter and gets one retry.
 */
async function insertWithFreshSku(data: Omit<Prisma.ProductUncheckedCreateInput, "sku">): Promise<Product | SaveFailure> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await createWithNextSku(data);
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) throw error;
      if (data.ean && (await prisma.product.findUnique({ where: { ean: data.ean }, select: { id: true } }))) {
        return { ok: false, message: DUPLICATE_EAN_ERROR, fieldErrors: { ean: [DUPLICATE_EAN_ERROR] } };
      }
      if (attempt >= 1) return { ok: false, message: SAVE_FAILED };
      await resyncSkuCounter();
    }
  }
}

export async function createProduct(rawInput: unknown, offImageUrls?: OffImageUrls): Promise<SaveProductResult> {
  const parsed = productInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const category = await assignableCategory(parsed.data.categoryId);
  if (!category) {
    return { ok: false, message: CATEGORY_ERROR, fieldErrors: { categoryId: [CATEGORY_ERROR] } };
  }
  // The /scan forms send no kind; the category decides (a steamer under Non-Food is non_food).
  const input = { ...parsed.data, kind: parsed.data.kind ?? suggestKind(category) };

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
    kind: input.kind,
    unitType: input.unitType,
    contentAmount: input.contentAmount ?? null,
    contentUnit: input.contentUnit ?? null,
    storageType: input.storageType,
    ingredientsDe: input.ingredientsDe || null,
    allergens: input.allergens,
    traces: input.traces,
    allergensConfirmedAt: allergensConfirmedAtFor(input, null, new Date()),
    notes: input.notes || null,
    dataSource: input.dataSource,
    dataComplete,
    ...(input.nutrition !== undefined && { nutrition: input.nutrition }),
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
  priceRappen: priceRappenSchema,
  isAvailable: z.boolean(),
});

/** Der <5s-Pfad für einen bereits erfassten Artikel: nur Preis und Verfügbarkeit. */
export async function applyQuickUpdate(rawInput: unknown): Promise<SaveProductResult> {
  const parsed = quickUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen." };
  }
  const { id, priceRappen, isAvailable } = parsed.data;
  const existing = await prisma.product.findUnique({ where: { id }, select: { stockQty: true } });
  if (!existing) return { ok: false, message: PRODUCT_NOT_FOUND };
  // With stock tracking, shop availability follows the stock (lib/stock/availability.ts);
  // the checkbox only applies to articles without tracking.
  const data = existing.stockQty === null ? { priceRappen, isAvailable } : { priceRappen };
  let product: Product;
  try {
    product = await prisma.product.update({ where: { id }, data });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) return { ok: false, message: PRODUCT_NOT_FOUND };
    throw error;
  }

  await enqueueProductSync(id);
  triggerBackgroundDrain();

  return { ok: true, product: toProductSummary(product) };
}
