import "server-only";
import { bookMovement, StockError } from "./ledger";
import { shopSaleSchema } from "./schemas";
import { runStockTx, type StockResult } from "./run";

export interface ShopSaleResult {
  movementId: string;
  stockAfter: number;
}

/**
 * "Verkauf erfassen": one scanned shop sale. Only for articles with stock
 * tracking; for the others a sale would start the ledger with a negative
 * stock, so the article must be counted (Inventur) or received first.
 */
export async function bookShopSale(rawInput: unknown): Promise<StockResult<ShopSaleResult>> {
  const parsed = shopSaleSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Menge muss eine ganze Zahl ab 1 sein." };
  return runStockTx(async (tx, buffer) => {
    const product = await tx.product.findUnique({ where: { id: parsed.data.productId }, select: { stockQty: true } });
    if (!product) throw new StockError("Artikel nicht gefunden.");
    if (product.stockQty === null) {
      throw new StockError("Für diesen Artikel wird noch kein Bestand geführt. Erst zählen (Inventur) oder Wareneingang buchen.");
    }
    const booked = await bookMovement(tx, { productId: parsed.data.productId, type: "sale_shop", quantity: -parsed.data.quantity }, buffer);
    return { movementId: booked.movement.id, stockAfter: booked.stockAfter };
  });
}
