import "server-only";
import { drainOutbox } from "./drain";
import { pushPendingImages } from "./image-push";
import { enqueueProductSync } from "./outbox";
import { importPendingOrders } from "./orders";
import { getShopSyncSettings } from "./settings";

export interface SyncRunResult {
  sent: number;
  dropped: number;
  failed: number;
  ordersImported: number;
  skippedNoSettings: boolean;
}

/** One full sync pass: push the outbox, then pull new paid orders. Used by the manual "Alles synchronisieren" button and the periodic background poll (electron/src/main.ts). */
export async function runSyncPass(): Promise<SyncRunResult> {
  const settings = await getShopSyncSettings();

  // Any photo that's reached dataComplete locally but never made it to R2
  // (shop internet dropped mid-upload, or this is the first pass since it
  // was added) gets pushed first, then its product is re-queued so the
  // outbox's next publish payload actually includes the new r2Key.
  const touchedProductIds = await pushPendingImages(settings);
  for (const productId of touchedProductIds) {
    await enqueueProductSync(productId);
  }

  const drainResult = await drainOutbox(settings);
  const orderResult = await importPendingOrders(settings);
  return {
    sent: drainResult.sent,
    dropped: drainResult.dropped,
    failed: drainResult.failed,
    ordersImported: orderResult.imported,
    skippedNoSettings: drainResult.skippedNoSettings,
  };
}

/**
 * Fire-and-forget trigger for right after a product save - never awaited by
 * the caller, so a slow/offline backend can't make "Speichern" hang. Errors
 * are swallowed here (same tolerant pattern as lib/images.ts): the outbox
 * row itself is already durable, so a failed attempt just waits for the
 * next drain (manual button or the periodic poll) instead of surfacing to
 * the person who just saved a product.
 */
export function triggerBackgroundDrain(): void {
  runSyncPass().catch((error) => console.error("[sync] background sync pass failed:", error));
}
