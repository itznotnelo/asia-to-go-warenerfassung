import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { shopDeleteDueAt } from "@/lib/archive-grace";
import { buildCategoryOp, buildProductOp, toProductForSync, type CategoryForSync, type ImageForSync } from "./build-ops";
import type { PublishOp } from "./types";

/** The plain client or a $transaction client, so a local change and its outbox row commit together (review should #34). */
export type OutboxDb = Prisma.TransactionClient;

async function upsertOutboxRow(
  db: OutboxDb,
  entityType: "category" | "product",
  entityId: string,
  op: PublishOp,
  notBefore: Date | null = null,
): Promise<void> {
  await db.syncOutbox.upsert({
    where: { entityId },
    create: { entityType, entityId, payload: op as object, notBefore },
    update: { entityType, payload: op as object, attempts: 0, lastError: null, notBefore },
  });
}

async function enqueueCategory(db: OutboxDb, category: CategoryForSync): Promise<void> {
  await upsertOutboxRow(db, "category", category.id, buildCategoryOp(category));
}

/**
 * Re-queues one product for the next drain, based on its *current* DB state
 * - eligible (dataComplete && isAvailable && not archived) becomes an upsert,
 * anything else becomes a delete (idempotent on the backend either way).
 * Called after every save (ticket #1369's "on save push to the backend"), so
 * a product that flips from eligible to not between two saves correctly gets
 * removed from the shop on the next drain instead of lingering.
 *
 * An archived product's delete waits until its grace period is over
 * (notBefore), no matter what re-queued it. Pass the $transaction client to
 * commit the outbox row together with the change that caused it.
 */
export async function enqueueProductSync(productId: string, db: OutboxDb = prisma): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { images: true, category: true },
  });
  if (!product) return;

  const op = buildProductOp(toProductForSync(product), product.images satisfies ImageForSync[]);
  const notBefore = op.op === "delete" && product.archivedAt ? shopDeleteDueAt(product.archivedAt) : null;
  await upsertOutboxRow(db, "product", productId, op, notBefore);

  if (op.op === "upsert") {
    await enqueueCategory(db, product.category);
  }
}

/** A deleted product can't be read back from the DB anymore - the delete op just needs the id. */
export async function enqueueProductDeleteSync(productId: string, db: OutboxDb = prisma): Promise<void> {
  await upsertOutboxRow(db, "product", productId, { op: "delete", id: productId });
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
