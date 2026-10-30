"use server";

import { getShopSyncSettings, saveShopSyncSettings } from "@/lib/sync/settings";
import { countPendingOutbox, enqueueAllProductsSync } from "@/lib/sync/outbox";
import { countStuckOutbox, retryStuckOutbox } from "@/lib/sync/drain";
import { runSyncPass, type SyncRunResult } from "@/lib/sync/runner";
import { resolveDeviceKey, toShopSyncSettingsView, type ShopSyncSettingsView } from "@/lib/sync/types";
import { shopSyncSettingsInputSchema as settingsSchema } from "@/lib/sync/validate";

// A server action is callable by anything that can POST to the app, so this
// returns the view without the key (review should #38).
export async function loadShopSyncSettings(): Promise<ShopSyncSettingsView> {
  return toShopSyncSettingsView(await getShopSyncSettings());
}

export async function loadPendingOutboxCount(): Promise<number> {
  return countPendingOutbox();
}

export async function loadStuckOutboxCount(): Promise<number> {
  return countStuckOutbox();
}

export async function updateShopSyncSettings(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // https only, length caps (#3071). Our own German refine text ('Nur https-Adressen erlaubt')
  // is shown as is; zod's built-in messages are English, so those get the generic line.
  const parsed = settingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.code === "custom" ? issue.message : "Bitte Eingaben prüfen." };
  }
  const stored = await getShopSyncSettings();
  await saveShopSyncSettings({
    ...parsed.data,
    deviceKey: resolveDeviceKey(parsed.data.deviceKey, stored.deviceKey),
  });
  return { ok: true };
}

/** The periodic background poll and the "Jetzt synchronisieren" button both just drain whatever's already queued. */
export async function syncNow(): Promise<SyncRunResult> {
  return runSyncPass();
}

/** "Alles synchronisieren": re-queues every product first, regardless of whether it changed, gives stuck rows another try, then drains. */
export async function syncAllNow(): Promise<SyncRunResult> {
  await enqueueAllProductsSync();
  await retryStuckOutbox();
  return runSyncPass();
}
