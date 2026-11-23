import type { ImageType } from "@/lib/generated/prisma/client";

/**
 * Which stored photos a new upload takes the place of. Vorderseite, Zutaten
 * and Nährwerte exist once per article, so a retaken photo replaces the old
 * one (otherwise the webshop shows both). "Weitere" photos add up.
 */
export function imagesReplacedBy<T extends { id: string; type: ImageType }>(existing: readonly T[], uploadType: ImageType): T[] {
  if (uploadType === "other") return [];
  return existing.filter((image) => image.type === uploadType);
}
