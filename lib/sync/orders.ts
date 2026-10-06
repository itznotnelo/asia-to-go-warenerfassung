import "server-only";
import { prisma } from "@/lib/prisma";
import { ackOrder, fetchPendingOrders } from "./client";
import { hasShopSyncSettings, type PendingOrder, type ShopSyncSettingsValue } from "./types";

// `null` means "stock isn't tracked for this product" (the field is
// optional in the Prisma schema) - an order against it never touches it.
// Floors at 0 instead of going negative on an over-sold item.
export function applyOrderToStock(currentQty: number | null, orderedQty: number): number | null {
  if (currentQty === null) return null;
  return Math.max(0, currentQty - orderedQty);
}

async function importOneOrder(settings: ShopSyncSettingsValue, order: PendingOrder): Promise<void> {
  const existing = await prisma.shopOrder.findUnique({ where: { id: order.id } });
  if (existing) {
    // Already imported in an earlier run - the backend retried the pending
    // list before our previous ack landed. Ack again (idempotent) and stop,
    // don't apply the stock decrement twice.
    await ackOrder(settings, order.id);
    return;
  }

  await prisma.shopOrder.create({
    data: {
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      fulfilmentType: order.fulfilmentType,
      totalRappen: order.totalRappen,
      notes: order.notes,
      items: {
        create: order.items.map((item) => ({ productId: item.productId, nameDe: item.nameDe, qty: item.qty })),
      },
    },
  });

  for (const item of order.items) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { stockQty: applyOrderToStock(product.stockQty, item.qty) },
    });
  }

  await ackOrder(settings, order.id);
}

/** Pulls every pending (paid) order from the backend, one at a time so a failure on order N doesn't lose orders 1..N-1 already imported. */
export async function importPendingOrders(settings: ShopSyncSettingsValue): Promise<{ imported: number; skippedNoSettings: boolean }> {
  if (!hasShopSyncSettings(settings)) {
    return { imported: 0, skippedNoSettings: true };
  }

  const pending = await fetchPendingOrders(settings);
  let imported = 0;
  for (const order of pending) {
    await importOneOrder(settings, order);
    imported += 1;
  }
  return { imported, skippedNoSettings: false };
}
