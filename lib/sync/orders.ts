import "server-only";
import { prisma } from "@/lib/prisma";
import { ackOrder, fetchPendingOrders } from "./client";
import { parsePendingOrders, type ValidPendingOrder } from "./order-schema";
import { hasShopSyncSettings, type ShopSyncSettingsValue } from "./types";

async function importOneOrder(settings: ShopSyncSettingsValue, order: ValidPendingOrder): Promise<void> {
  const existing = await prisma.shopOrder.findUnique({ where: { id: order.id } });
  if (existing) {
    // Already imported in an earlier run - the backend retried the pending
    // list before our previous ack landed. Create and stock decrement were
    // committed together, so just ack again (idempotent) and stop.
    await ackOrder(settings, order.id);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // A product deleted locally after the customer ordered it would fail the
    // ShopOrderItem FK (P2003) - store the line without the link instead,
    // nameDe still says what was ordered.
    const referencedIds = [...new Set(order.items.flatMap((item) => (item.productId ? [item.productId] : [])))];
    const known = await tx.product.findMany({ where: { id: { in: referencedIds } }, select: { id: true } });
    const knownIds = new Set(known.map((product) => product.id));
    const items = order.items.map((item) => ({
      productId: item.productId && knownIds.has(item.productId) ? item.productId : null,
      nameDe: item.nameDe,
      qty: item.qty,
    }));

    await tx.shopOrder.create({
      data: {
        id: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        fulfilmentType: order.fulfilmentType,
        totalRappen: order.totalRappen,
        notes: order.notes,
        // When the customer placed it, not when this app imported it.
        createdAt: new Date(order.createdAt),
        items: { create: items },
      },
    });

    // Atomic decrement, then floor at 0 for an over-sold item. `stockQty`
    // null means "not tracked" and is never touched.
    for (const item of items) {
      if (!item.productId) continue;
      await tx.product.updateMany({
        where: { id: item.productId, stockQty: { not: null } },
        data: { stockQty: { decrement: item.qty } },
      });
      await tx.product.updateMany({ where: { id: item.productId, stockQty: { lt: 0 } }, data: { stockQty: 0 } });
    }
  });

  // Only after commit: if anything above threw, the backend keeps the order
  // pending and the next pass retries it from scratch.
  await ackOrder(settings, order.id);
}

export interface ImportOrdersResult {
  imported: number;
  failed: number;
  /** Ids (or null when the backend sent no usable id) of orders that were not imported this pass. */
  failedOrderIds: (string | null)[];
  skippedNoSettings: boolean;
}

/** Pulls every pending (paid) order from the backend. Each order succeeds or fails on its own, so one bad order never blocks the ones behind it. */
export async function importPendingOrders(settings: ShopSyncSettingsValue): Promise<ImportOrdersResult> {
  if (!hasShopSyncSettings(settings)) {
    return { imported: 0, failed: 0, failedOrderIds: [], skippedNoSettings: true };
  }

  const { valid, invalid } = parsePendingOrders(await fetchPendingOrders(settings));
  const failedOrderIds: (string | null)[] = [];
  for (const bad of invalid) {
    console.error("[sync] pending order rejected by schema:", bad.id ?? "(no id)", bad.error);
    failedOrderIds.push(bad.id);
  }

  let imported = 0;
  for (const order of valid) {
    try {
      await importOneOrder(settings, order);
      imported += 1;
    } catch (error) {
      console.error("[sync] order import failed:", order.id, error);
      failedOrderIds.push(order.id);
    }
  }
  return { imported, failed: failedOrderIds.length, failedOrderIds, skippedNoSettings: false };
}
