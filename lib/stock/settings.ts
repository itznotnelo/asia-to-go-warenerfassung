import "server-only";
import { prisma } from "@/lib/prisma";
import { getSafetyBuffer, refreshAllAvailability } from "./ledger";
import { safetyBufferSchema } from "./schemas";
import { runStockTx, type StockResult } from "./run";

export async function readSafetyBuffer(): Promise<number> {
  return getSafetyBuffer(prisma);
}

/** Saves the webshop safety buffer and re-derives every tracked article's availability in the same transaction. */
export async function saveSafetyBuffer(rawInput: unknown): Promise<StockResult<{ changed: number }>> {
  const parsed = safetyBufferSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Bitte eine ganze Zahl von 0 bis 9999 eingeben." };
  const buffer = parsed.data.shopSafetyBuffer;
  return runStockTx(async (tx) => {
    await tx.stockSettings.upsert({ where: { id: 1 }, create: { id: 1, shopSafetyBuffer: buffer }, update: { shopSafetyBuffer: buffer } });
    return { changed: await refreshAllAvailability(tx, buffer) };
  });
}
