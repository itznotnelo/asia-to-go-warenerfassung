import type { Prisma } from "@/lib/generated/prisma/client";

// No "server-only" here: instrumentation.ts imports this at server start,
// outside the React server layer.

export const LEGACY_OPENING_NOTE = "Anfangsbestand aus Version 0.2 übernommen";

/**
 * v0.2 had a nullable Product.stockQty without a ledger (web orders
 * decremented it). An article with a stock value but no movement gets one
 * opening "manual" movement of that value, so the invariant holds. Data
 * fix in code, not in the migration (migrations are never hand-edited).
 * Idempotent; runs at server start (instrumentation.ts). Returns the count.
 */
export async function backfillLegacyStock(db: Prisma.TransactionClient): Promise<number> {
  const legacy = await db.product.findMany({
    where: { stockQty: { not: null }, stockMovements: { none: {} } },
    select: { id: true, stockQty: true },
  });
  let created = 0;
  for (const product of legacy) {
    if (!product.stockQty) continue; // 0: the empty ledger already sums to 0
    await db.stockMovement.create({
      data: {
        productId: product.id,
        type: "manual",
        quantity: product.stockQty,
        stockAfter: product.stockQty,
        note: LEGACY_OPENING_NOTE,
        createdAt: new Date(),
      },
    });
    created += 1;
  }
  return created;
}
