import "server-only";
import { prisma } from "@/lib/prisma";
import { buildCategoryOp, buildProductOp, type CategoryForSync, type ImageForSync, type ProductForSync } from "./build-ops";
import type { PublishOp } from "./types";

async function upsertOutboxRow(entityType: "category" | "product", entityId: string, op: PublishOp): Promise<void> {
  await prisma.syncOutbox.upsert({
    where: { entityId },
    create: { entityType, entityId, payload: op as object },
    update: { entityType, payload: op as object, attempts: 0, lastError: null },
  });
}

async function enqueueCategory(category: CategoryForSync): Promise<void> {
  await upsertOutboxRow("category", category.id, buildCategoryOp(category));
}

/**
 * Re-queues one product for the next drain, based on its *current* DB state
 * - eligible (dataComplete && isAvailable) becomes an upsert, anything else
 * becomes a delete (idempotent on the backend either way). Called after
 * every save (ticket #1369's "on save push to the backend"), so a product
 * that flips from eligible to not between two saves correctly gets removed
 * from the shop on the next drain instead of lingering.
 */
export async function enqueueProductSync(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: true, category: true },
  });
  if (!product) return;

  const op = buildProductOp(product as unknown as ProductForSync, product.images as unknown as ImageForSync[]);
  await upsertOutboxRow("product", productId, op);

  if (op.op === "upsert") {
    await enqueueCategory(product.category);
  }
}

/** A deleted product can't be read back from the DB anymore - the delete op just needs the id. */
export async function enqueueProductDeleteSync(productId: string): Promise<void> {
  await upsertOutboxRow("product", productId, { op: "delete", id: productId });
}

/** Backs the "Alles synchronisieren" button - re-queues every product, regardless of whether it changed. */
export async function enqueueAllProductsSync(): Promise<number> {
  const products = await prisma.product.findMany({ select: { id: true } });
  for (const product of products) {
    await enqueueProductSync(product.id);
  }
  return products.length;
}

export async function countPendingOutbox(): Promise<number> {
  return prisma.syncOutbox.count();
}
