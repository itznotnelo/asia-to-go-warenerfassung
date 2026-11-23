import "server-only";
import { bookMovement, type StockDb } from "./ledger";

/**
 * Books a sale_web movement per line of an imported web order, inside the
 * import transaction (lib/sync/orders.ts), so the order and its stock change
 * commit together and a retried import never books twice. Articles without
 * stock tracking are left alone (no ledger for them). Returns the count.
 */
export async function bookWebOrderSales(
  db: StockDb,
  orderId: string,
  items: { productId: string | null; qty: number }[],
  buffer: number,
): Promise<number> {
  const ids = [...new Set(items.flatMap((item) => (item.productId ? [item.productId] : [])))];
  const tracked = new Set(
    (await db.product.findMany({ where: { id: { in: ids }, stockQty: { not: null } }, select: { id: true } })).map((p) => p.id),
  );
  let booked = 0;
  for (const item of items) {
    if (!item.productId || !tracked.has(item.productId)) continue;
    await bookMovement(db, { productId: item.productId, type: "sale_web", quantity: -item.qty, shopOrderId: orderId }, buffer);
    booked += 1;
  }
  return booked;
}
