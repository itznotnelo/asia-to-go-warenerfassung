"use server";

import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { computeDataComplete, productInputSchema } from "@/lib/product-schema";

const updateProductSchema = productInputSchema.extend({ id: z.string().min(1) });

type UpdateProductResult =
  | { ok: true; product: ProductSummary }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

/** Volle Bearbeitung auf der Detailseite — anders als saveProduct() wird hier nie eine neue SKU vergeben. */
export async function updateProduct(rawInput: unknown): Promise<UpdateProductResult> {
  const parsed = updateProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, ...input } = parsed.data;

  const existing = await prisma.product.findUnique({ where: { id }, include: { images: true } });
  if (!existing) {
    return { ok: false, message: "Artikel nicht gefunden." };
  }
  const dataComplete = computeDataComplete(input, existing.images.length > 0);

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
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
      },
    });
    return { ok: true, product: toProductSummary(product) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Dieser Barcode ist bereits einem anderen Artikel zugeordnet." };
    }
    throw error;
  }
}

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1).optional(),
  vatRate: z.number().optional(),
  isAvailable: z.boolean().optional(),
});

/** Bulk-Aktionen aus der Artikelliste: Kategorie setzen, MwSt setzen, Verfügbarkeit umschalten. */
export async function bulkUpdateProducts(
  rawInput: unknown,
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const parsed = bulkUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen." };
  }
  const { ids, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "Keine Änderung ausgewählt." };
  }

  const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: patch });
  return { ok: true, count: result.count };
}

export async function deleteProduct(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!id) return { ok: false, message: "Ungültige ID." };
  await prisma.product.delete({ where: { id } });
  return { ok: true };
}
