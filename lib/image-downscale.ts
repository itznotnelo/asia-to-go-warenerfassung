// Phone photos are 3-5 MB at 4000 px; the server keeps at most 1200 px
// (lib/images.ts MAX_EDGE), so shrink in the browser first (review should #25).
// Re-encoding also drops EXIF (GPS) before the file leaves the page.
export const UPLOAD_MAX_EDGE = 1600;
const UPLOAD_JPEG_QUALITY = 0.85;

/** Target size that fits inside maxEdge, or null when the image is already small enough. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = UPLOAD_MAX_EDGE,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downscales an image file to UPLOAD_MAX_EDGE as JPEG. Anything it can't
 * decode (HEIC, broken files) or doesn't need to shrink goes up unchanged,
 * so the server's own checks still decide.
 */
export async function downscaleImage(file: File, maxEdge: number = UPLOAD_MAX_EDGE): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const target = fitWithin(bitmap.width, bitmap.height, maxEdge);
    if (!target) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", UPLOAD_JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
