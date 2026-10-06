"use server";

import { z } from "zod";
import { getShopSyncSettings, saveShopSyncSettings } from "@/lib/sync/settings";
import { countPendingOutbox, enqueueAllProductsSync } from "@/lib/sync/outbox";
import { runSyncPass, type SyncRunResult } from "@/lib/sync/runner";
import type { ShopSyncSettingsValue } from "@/lib/sync/types";

export async function loadShopSyncSettings(): Promise<ShopSyncSettingsValue> {
  return getShopSyncSettings();
}

export async function loadPendingOutboxCount(): Promise<number> {
  return countPendingOutbox();
}

const settingsSchema = z.object({
  apiUrl: z.string().trim(),
  deviceId: z.string().trim(),
  deviceKey: z.string().trim(),
});

export async function updateShopSyncSettings(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = settingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Bitte Eingaben prüfen." };
  }
  await saveShopSyncSettings(parsed.data);
  return { ok: true };
}

/** The periodic background poll and the "Jetzt synchronisieren" button both just drain whatever's already queued. */
export async function syncNow(): Promise<SyncRunResult> {
  return runSyncPass();
}

/** "Alles synchronisieren": re-queues every product first, regardless of whether it changed, then drains. */
export async function syncAllNow(): Promise<SyncRunResult> {
  await enqueueAllProductsSync();
  return runSyncPass();
}
