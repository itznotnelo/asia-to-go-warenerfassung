import "server-only";
import { prisma } from "@/lib/prisma";
import { triggerBackgroundDrain } from "@/lib/sync/runner";
import { getSafetyBuffer, StockError, type StockDb } from "./ledger";

export type StockResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

// Bookings with many lines (a whole stocktake) must not hit Prisma's 5 s default.
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/**
 * Runs one stock operation in a single DB transaction (all or nothing) with
 * the current safety buffer. A StockError becomes { ok: false, message } for
 * the UI; anything else is a real bug and is thrown. Afterwards the shop sync
 * is nudged in the background in case availability changed.
 */
export async function runStockTx<T>(fn: (tx: StockDb, buffer: number) => Promise<T>): Promise<StockResult<T>> {
  try {
    const data = await prisma.$transaction(async (tx) => fn(tx, await getSafetyBuffer(tx)), TX_OPTIONS);
    triggerBackgroundDrain();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof StockError) return { ok: false, message: error.message };
    throw error;
  }
}
