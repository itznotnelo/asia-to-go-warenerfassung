import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { uploadImageToBackend } from "./client";
import { hasShopSyncSettings, type ShopSyncSettingsValue } from "./types";

const IMAGE_ROOT = process.env.IMAGE_ROOT ?? path.join(process.cwd(), "data", "images");

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function contentTypeFor(relativePath: string): string {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(relativePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Uploads every ProductImage that doesn't have an r2Key yet (ticket #1369's
 * "wire up image upload so dataComplete can become true" is already true
 * locally - this is the missing half, pushing those same photos to the
 * backend). Best-effort per image: one failed upload (shop internet drops
 * mid-batch) doesn't throw and doesn't block the others - the image just
 * stays r2Key=null and gets retried on the next sync pass, same tolerant
 * pattern as lib/images.ts. Returns the distinct product ids touched, so
 * the caller can re-queue their outbox entry now that a photo is ready.
 */
export async function pushPendingImages(settings: ShopSyncSettingsValue): Promise<string[]> {
  if (!hasShopSyncSettings(settings)) return [];

  const images = await prisma.productImage.findMany({ where: { r2Key: null } });
  const touchedProductIds = new Set<string>();

  for (const image of images) {
    try {
      const bytes = await readFile(path.join(IMAGE_ROOT, image.path));
      const r2Key = await uploadImageToBackend(settings, image.productId, image.type, bytes, contentTypeFor(image.path));
      await prisma.productImage.update({ where: { id: image.id }, data: { r2Key } });
      touchedProductIds.add(image.productId);
    } catch (error) {
      console.error(`[sync] image upload failed for ${image.path}:`, error);
    }
  }

  return [...touchedProductIds];
}
