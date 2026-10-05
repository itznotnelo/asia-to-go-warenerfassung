import { NextResponse } from "next/server";
import { runSyncPass } from "@/lib/sync/runner";

/**
 * Hit by electron/src/main.ts's periodic timer (the Electron process owns
 * the lifecycle/interval, same pattern as its existing startup polling) and
 * available for manual triggering too. Idempotent and cheap to call when
 * there's nothing to do (drainOutbox/importPendingOrders both no-op fast).
 */
export async function POST() {
  const result = await runSyncPass();
  return NextResponse.json(result);
}
