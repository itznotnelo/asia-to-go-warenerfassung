import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isPathWithinRoot } from "@/lib/safe-path";

const IMAGE_ROOT = process.env.IMAGE_ROOT ?? path.join(process.cwd(), "data", "images");
const MAX_EDGE = 1200;
const THUMB_EDGE = 300;
const WEBP_QUALITY = 80;
const FETCH_TIMEOUT_MS = 8_000;

export interface StoredImage {
  /** Relativ zu data/images/, z.B. "ASIA-00001/front.webp". */
  path: string;
  width: number;
  height: number;
}

/**
 * Bringt Bildbytes auf max. 1200px Kante als WebP q80 (plus 300px-Thumbnail
 * daneben unter "{type}-thumb.webp"), speichert lokal unter data/images/{sku}/.
 * Wirft bei Fehlern — die Aufrufer entscheiden, wie tolerant sie sein wollen.
 */
async function processAndStoreImageBuffer(buffer: Buffer, sku: string, stem: string): Promise<StoredImage> {
  const dir = path.join(IMAGE_ROOT, sku);
  await mkdir(dir, { recursive: true });

  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const metadata = await sharp(webpBuffer).metadata();

  const filename = `${stem}.webp`;
  await writeFile(path.join(dir, filename), webpBuffer);

  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  await writeFile(path.join(dir, `${stem}-thumb.webp`), thumbBuffer);

  return { path: `${sku}/${filename}`, width: metadata.width ?? 0, height: metadata.height ?? 0 };
}

/**
 * Lädt ein Bild von einer URL — nie hotlinken, siehe openfoodfacts SKILL.md.
 * Tolerant: Timeout/Fehler geben null zurück statt zu werfen, ein fehlendes
 * Bild darf die Erfassung nie stoppen.
 */
export async function downloadAndStoreImage(url: string, sku: string, type: string): Promise<StoredImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.error(`[images] HTTP ${response.status} beim Laden von ${type} für ${sku}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return await processAndStoreImageBuffer(buffer, sku, type);
  } catch (error) {
    console.error(`[images] Download fehlgeschlagen für ${type} (${sku}):`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verarbeitet ein manuell hochgeladenes Bild (eigenes Foto, kein Hotlink-
 * Thema). Tolerant wie downloadAndStoreImage — ein kaputtes Bild darf den
 * Rest der Erfassung nicht blockieren.
 */
export async function storeUploadedImage(buffer: Buffer, sku: string, type: string): Promise<StoredImage | null> {
  try {
    // A name of its own per upload (review should: re-upload): a retaken photo never
    // overwrites the file an older row still points to, and two "Weitere" photos
    // no longer share one file.
    return await processAndStoreImageBuffer(buffer, sku, uniqueImageStem(type));
  } catch (error) {
    console.error(`[images] Verarbeitung fehlgeschlagen für ${type} (${sku}):`, error);
    return null;
  }
}

/** "{type}-{time}{random}", e.g. "front-mb3k2x9f4a1c": sorts by upload time, never repeats. */
export function uniqueImageStem(type: string): string {
  return `${type}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

/**
 * Removes one stored image and its thumbnail (the files a replaced ProductImage
 * row pointed to). Best effort like removeProductImageDir; refuses anything
 * that is not "{sku}/{name}.webp" under IMAGE_ROOT.
 */
export async function removeStoredImage(relativePath: string): Promise<void> {
  const file = path.join(IMAGE_ROOT, relativePath);
  const parts = relativePath.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1].endsWith(".webp") || !isPathWithinRoot(IMAGE_ROOT, file)) {
    console.error(`[images] Bild nicht entfernt, ungültiger Pfad: ${JSON.stringify(relativePath)}`);
    return;
  }
  try {
    await rm(file, { force: true });
    await rm(file.replace(/\.webp$/, "-thumb.webp"), { force: true });
  } catch (error) {
    console.error(`[images] Bild ${relativePath} konnte nicht entfernt werden:`, error);
  }
}

/**
 * Entfernt data/images/{sku}/ eines endgültig gelöschten Artikels. Best effort:
 * ein Fehler wird nur geloggt, das Löschen in der DB ist da schon passiert.
 * Weigert sich bei allem, was nicht genau ein Ordner unter IMAGE_ROOT ist.
 */
export async function removeProductImageDir(sku: string): Promise<void> {
  const dir = path.join(IMAGE_ROOT, sku);
  const relative = path.relative(IMAGE_ROOT, dir);
  if (!sku || relative === "" || relative.includes(path.sep) || !isPathWithinRoot(IMAGE_ROOT, dir)) {
    console.error(`[images] Bildordner nicht entfernt, ungültige SKU: ${JSON.stringify(sku)}`);
    return;
  }
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[images] Bildordner ${sku} konnte nicht entfernt werden:`, error);
  }
}
