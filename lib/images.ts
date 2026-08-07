import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

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
async function processAndStoreImageBuffer(buffer: Buffer, sku: string, type: string): Promise<StoredImage> {
  const dir = path.join(IMAGE_ROOT, sku);
  await mkdir(dir, { recursive: true });

  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const metadata = await sharp(webpBuffer).metadata();

  const filename = `${type}.webp`;
  await writeFile(path.join(dir, filename), webpBuffer);

  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  await writeFile(path.join(dir, `${type}-thumb.webp`), thumbBuffer);

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
    return await processAndStoreImageBuffer(buffer, sku, type);
  } catch (error) {
    console.error(`[images] Verarbeitung fehlgeschlagen für ${type} (${sku}):`, error);
    return null;
  }
}
