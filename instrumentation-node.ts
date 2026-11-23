import { prisma } from "@/lib/prisma";
import { backfillLegacyStock } from "@/lib/stock/legacy";

// v0.2 -> v0.3: stock values without a ledger get their opening movement.
// Never blocks the start: the backfill is idempotent and retried next start.
try {
  const created = await prisma.$transaction((tx) => backfillLegacyStock(tx));
  if (created > 0) console.log(`[stock] opening movements created for ${created} article(s) from v0.2`);
} catch (error) {
  console.error("[stock] legacy stock backfill failed:", error);
}
