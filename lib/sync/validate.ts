import { z } from "zod";

// Ticket #3071 (review #38): the device key goes out as a bearer token on
// every sync call, so the backend URL must be https (a typo'd http:// would
// send it in clear text). The backend's upload reply is external data
// (CLAUDE.md: "Externe Daten immer durch Zod") and its r2Key is published to
// the webshop, so it must look exactly like the key the backend builds:
// atg-shop-backend src/routes/publish.js `products/${productId}/${type}-${Date.now()}.jpg`.

export const API_URL_MAX_LENGTH = 200;
export const DEVICE_ID_MAX_LENGTH = 100;
export const DEVICE_KEY_MAX_LENGTH = 200;
const R2_KEY_MAX_LENGTH = 300;

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https only; plain http just for a backend on this machine (wrangler dev). */
export function isAllowedApiUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_DEV_HOSTS.has(url.hostname);
}

/** Empty apiUrl keeps sync switched off, as today. */
export const apiUrlSchema = z
  .string()
  .trim()
  .max(API_URL_MAX_LENGTH, "URL zu lang")
  .refine((value) => value === "" || isAllowedApiUrl(value), "Nur https-Adressen erlaubt");

export const shopSyncSettingsInputSchema = z.object({
  apiUrl: apiUrlSchema,
  deviceId: z.string().trim().max(DEVICE_ID_MAX_LENGTH),
  deviceKey: z.string().trim().max(DEVICE_KEY_MAX_LENGTH),
});

const R2_KEY_PATTERN = /^products\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/;

export const uploadResponseSchema = z.object({
  r2Key: z.string().max(R2_KEY_MAX_LENGTH).regex(R2_KEY_PATTERN),
});

/**
 * Validates the /images reply and that the key belongs to the product we
 * uploaded for. Throws, so image-push leaves r2Key null and retries later.
 */
export function parseUploadResponse(data: unknown, productId: string): string {
  const parsed = uploadResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("image upload failed: invalid response from backend");
  }
  if (!parsed.data.r2Key.startsWith(`products/${productId}/`)) {
    throw new Error("image upload failed: r2Key for another product");
  }
  return parsed.data.r2Key;
}
