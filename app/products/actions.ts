"use server";

import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toProductSummary, type ProductSummary } from "@/lib/product-summary";
import { computeDataComplete, isProductComplete, productInputSchema } from "@/lib/product-schema";
import { storeUploadedImage } from "@/lib/images";

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

  return { ok: true, path: stored.path, dataComplete };
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
