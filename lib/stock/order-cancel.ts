import "server-only";
import { reverseMovement, StockError } from "./ledger";
import { cancelOrderSchema } from "./schemas";
import { runStockTx, type StockResult } from "./run";

// Separate from web-orders.ts: that one is imported by the sync import
// (lib/sync/orders.ts), this one uses runStockTx, which imports the sync runner.

/**
 * Cancels an open web order in the app and books its stock back (reversal of
 * every sale_web movement of the order). Refunds happen outside this app.
 */
export async function cancelWebOrder(rawInput: unknown): Promise<StockResult<{ reversed: number }>> {
  const parsed = cancelOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  return runStockTx(async (tx, buffer) => {
    const claimed = await tx.shopOrder.updateMany({
      where: { id: parsed.data.orderId, status: { in: ["received", "picked", "ready"] } },
      data: { status: "cancelled" },
    });
    if (claimed.count === 0) throw new StockError("Bestellung nicht gefunden oder schon abgeschlossen.");
    const movements = await tx.stockMovement.findMany({
      where: { shopOrderId: parsed.data.orderId, type: "sale_web", reversesId: null, reversedBy: { is: null } },
      orderBy: { productId: "asc" },
    });
    for (const movement of movements) {
      await reverseMovement(tx, movement, buffer, "Bestellung storniert");
    }
    return { reversed: movements.length };
  });
}
