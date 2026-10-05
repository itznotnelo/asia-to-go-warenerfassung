import "server-only";
import type { PendingOrder, PublishOp, ShopSyncSettingsValue } from "./types";

function authHeaders(settings: ShopSyncSettingsValue): Record<string, string> {
  return {
    "x-device-id": settings.deviceId,
    authorization: `Bearer ${settings.deviceKey}`,
  };
}

function apiUrl(settings: ShopSyncSettingsValue, path: string): string {
  return `${settings.apiUrl.replace(/\/$/, "")}${path}`;
}

/** POSTs a whole drained batch in one call - the backend applies each op independently and idempotently. */
export async function publishOps(settings: ShopSyncSettingsValue, ops: PublishOp[]): Promise<void> {
  const response = await fetch(apiUrl(settings, "/publish"), {
    method: "POST",
    headers: { ...authHeaders(settings), "content-type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!response.ok) {
    throw new Error(`publish failed: HTTP ${response.status}`);
  }
}

/** Uploads one photo's bytes, returns the R2 key to store on the local ProductImage row. */
export async function uploadImageToBackend(
  settings: ShopSyncSettingsValue,
  productId: string,
  type: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  // Blob, not the raw Uint8Array - this TS config's BodyInit (mixing dom +
  // @types/node lib defs) doesn't accept ArrayBufferView directly, and a
  // Buffer's .buffer can be typed ArrayBufferLike (possibly shared) rather
  // than a plain ArrayBuffer, so copy the exact byte range out explicitly.
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const response = await fetch(apiUrl(settings, "/images"), {
    method: "POST",
    headers: { ...authHeaders(settings), "content-type": contentType, "x-product-id": productId, "x-image-type": type },
    body: new Blob([arrayBuffer], { type: contentType }),
  });
  if (!response.ok) {
    throw new Error(`image upload failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { r2Key: string };
  return data.r2Key;
}

/** Only ever returns *paid* orders (filtered server-side) - see atg-shop-backend's handlePendingOrders. */
export async function fetchPendingOrders(settings: ShopSyncSettingsValue): Promise<PendingOrder[]> {
  const response = await fetch(apiUrl(settings, "/orders/pending"), { headers: authHeaders(settings) });
  if (!response.ok) {
    throw new Error(`fetch pending orders failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { items: PendingOrder[] };
  return data.items;
}

/** Idempotent on the backend - safe to call again for an order already acked. */
export async function ackOrder(settings: ShopSyncSettingsValue, orderId: string): Promise<void> {
  const response = await fetch(apiUrl(settings, `/orders/${orderId}/ack`), {
    method: "POST",
    headers: authHeaders(settings),
  });
  if (!response.ok) {
    throw new Error(`ack order failed: HTTP ${response.status}`);
  }
}
