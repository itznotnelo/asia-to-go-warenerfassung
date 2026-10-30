"use server";

import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { allergensConfirmedAtFor, computeDataComplete, isProductComplete, updateProductSchema } from "@/lib/product-schema";
import { storeUploadedImage } from "@/lib/images";
import { enqueueProductSync } from "@/lib/sync/outbox";
import { archiveProduct, purgeArchivedProduct, restoreArchivedProduct, type ArchiveResult } from "@/lib/product-archive";
import { triggerBackgroundDrain } from "@/lib/sync/runner";
import { applyBulkUpdate, type BulkUpdateResult } from "@/lib/bulk-update";
import { CATEGORY_ERROR, isAssignableCategory } from "@/lib/category-guard";

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
  if (!(await isAssignableCategory(input.categoryId))) {
    return { ok: false, message: CATEGORY_ERROR, fieldErrors: { categoryId: [CATEGORY_ERROR] } };
  }

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
        traces: input.traces,
        allergensConfirmedAt: allergensConfirmedAtFor(input, existing, new Date()),
        notes: input.notes || null,
        dataSource: input.dataSource,
        dataComplete,
        // The edit form doesn't send nutrition, so only write it when it was sent.
        ...(input.nutrition !== undefined && { nutrition: input.nutrition }),
      },
    });
    // Ticket #1369: jedes Speichern stösst "Auf Website veröffentlichen" an -
    // landet zuerst in der Outbox (schnell, lokal), der eigentliche Push läuft
    // danach im Hintergrund, blockiert also nie die Speichern-Antwort.
    await enqueueProductSync(product.id);
    triggerBackgroundDrain();
    return { ok: true, product: toProductSummary(product) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Dieser Barcode ist bereits einem anderen Artikel zugeordnet." };
    }
    throw error;
  }
}

const uploadImageSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["front", "ingredients", "nutrition", "other"]),
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type UploadImageResult =
  | { ok: true; path: string; dataComplete: boolean }
  | { ok: false; message: string };

/** Manueller Foto-Upload — der einzige Weg, wie ein OFF-Miss- oder Schnellerfassungs-Artikel je ein Bild bekommt. */
export async function uploadProductImage(formData: FormData): Promise<UploadImageResult> {
  const parsed = uploadImageSchema.safeParse({
    productId: formData.get("productId"),
    type: formData.get("type"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Ungültige Eingabe." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "Keine Datei erhalten." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "Nur Bilddateien sind erlaubt." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Datei zu gross (max. 10 MB)." };
  }

  const { productId, type } = parsed.data;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { ok: false, message: "Artikel nicht gefunden." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeUploadedImage(buffer, product.sku, type);
  if (!stored) {
    return { ok: false, message: "Bild konnte nicht verarbeitet werden." };
  }

  await prisma.productImage.create({
    data: { productId: product.id, type, path: stored.path, width: stored.width, height: stored.height },
  });

  let dataComplete = product.dataComplete;
  if (!dataComplete) {
    const summary = toProductSummary(product);
    dataComplete = isProductComplete(summary, true);
    if (dataComplete) {
      await prisma.product.update({ where: { id: product.id }, data: { dataComplete: true } });
    }
  }

  // Ein neues Bild kann einen Artikel erst jetzt vollständig machen (oder
  // ändert das Foto-Set eines bereits vollständigen) - auch hier erneut
  // zur Veröffentlichung anmelden, aus demselben Grund wie in updateProduct().
  await enqueueProductSync(product.id);
  triggerBackgroundDrain();

  return { ok: true, path: stored.path, dataComplete };
}

/** Bulk-Aktionen aus der Artikelliste: Kategorie setzen, MwSt setzen, Verfügbarkeit umschalten. */
export async function bulkUpdateProducts(rawInput: unknown): Promise<BulkUpdateResult> {
  return applyBulkUpdate(rawInput);
}

/** "Löschen": nur archivieren (review should #34), die Website folgt nach der Karenzzeit - siehe lib/product-archive.ts. */
export async function deleteProduct(id: string): Promise<ArchiveResult> {
  if (!id) return { ok: false, message: "Ungültige ID." };
  return archiveProduct(id);
}

/** "Rückgängig" / "Wiederherstellen" eines gelöschten Artikels. */
export async function restoreProduct(id: string): Promise<ArchiveResult> {
  if (!id) return { ok: false, message: "Ungültige ID." };
  return restoreArchivedProduct(id);
}

/** "Endgültig löschen": nur für gelöschte Artikel nach der Karenzzeit. */
export async function purgeProduct(id: string): Promise<ArchiveResult> {
  if (!id) return { ok: false, message: "Ungültige ID." };
  return purgeArchivedProduct(id);
}
