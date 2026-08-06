import "server-only";
import { prisma } from "@/lib/prisma";
import { downloadAndStoreImage } from "@/lib/images";
import type { ImageType } from "@/lib/generated/prisma/client";

// OFF-Produktdaten stehen unter ODbL, Bilder i.d.R. unter CC-BY-SA — Namensnennung
// nötig, sobald das Bild im öffentlichen Shop erscheint. Siehe SKILL.md "Lizenz und Fairness".
const OFF_ATTRIBUTION = "Open Food Facts (CC-BY-SA), world.openfoodfacts.org";

const IMAGE_TYPES: { key: "front" | "ingredients" | "nutrition"; type: ImageType }[] = [
  { key: "front", type: "front" },
  { key: "ingredients", type: "ingredients" },
  { key: "nutrition", type: "nutrition" },
];

export interface OffImageUrls {
  front?: string;
  ingredients?: string;
  nutrition?: string;
}

/**
 * Lädt alle vorhandenen OFF-Bild-URLs herunter und legt ProductImage-Zeilen
 * an. Best effort — ein einzelner Download-Fehler bricht die anderen nicht
 * ab. Gibt die Anzahl erfolgreich gespeicherter Bilder zurück.
 */
export async function attachOffImages(productId: string, sku: string, imageUrls: OffImageUrls): Promise<number> {
  let attached = 0;

  for (const { key, type } of IMAGE_TYPES) {
    const url = imageUrls[key];
    if (!url) continue;

    const stored = await downloadAndStoreImage(url, sku, type);
    if (!stored) continue;

    await prisma.productImage.create({
      data: {
        productId,
        type,
        path: stored.path,
        width: stored.width,
        height: stored.height,
        sourceAttribution: OFF_ATTRIBUTION,
      },
    });
    attached++;
  }

  return attached;
}
