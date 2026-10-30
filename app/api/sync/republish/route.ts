import { NextResponse } from "next/server";
import { getShopSyncSettings } from "@/lib/sync/settings";
import { enqueueAllProductsSync } from "@/lib/sync/outbox";
import { retryStuckOutbox } from "@/lib/sync/drain";
import { runSyncPass } from "@/lib/sync/runner";

/**
 * Used by electron/src/main.ts after a restore (files' UX R4a, storage 4.9):
 * GET tells whether the website sync is set up at all, POST is
 * "Artikel neu an die Website senden" (same as "Alles synchronisieren").
 */
export async function GET() {
  const s = await getShopSyncSettings();
  return NextResponse.json({ configured: Boolean(s.apiUrl && s.deviceId && s.deviceKey) });
}

export async function POST() {
  await enqueueAllProductsSync();
  await retryStuckOutbox();
  return NextResponse.json(await runSyncPass());
}
