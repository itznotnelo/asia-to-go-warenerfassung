import "server-only";
import { prisma } from "@/lib/prisma";
import { removeProductImageDir } from "@/lib/images";
import { isGracePeriodOver, SHOP_DELETE_GRACE_MINUTES } from "@/lib/archive-grace";
import { enqueueProductDeleteSync, enqueueProductSync } from "@/lib/sync/outbox";
import { triggerBackgroundDrain } from "@/lib/sync/runner";

// Review should #34: "Löschen" is a soft delete. The row stays (orders, scans
// and the SKU keep their link), the webshop delete waits for the grace period,
// and only "Endgültig löschen" on an archived article removes it for good.

export type ArchiveResult = { ok: true } | { ok: false; message: string };

export const ARCHIVE_NOT_FOUND = "Artikel nicht gefunden.";
export const PURGE_NOT_ARCHIVED = "Nur gelöschte Artikel können endgültig gelöscht werden.";
export const PURGE_TOO_EARLY = `Endgültig löschen geht erst ${SHOP_DELETE_GRACE_MINUTES} Minuten nach dem Löschen.`;

/**
 * Archives the article and queues its delayed shop delete in one transaction,
 * so the app and the outbox never disagree. Archiving twice keeps the first
 * archivedAt, so a second click does not push the shop delete further out.
 */
export async function archiveProduct(id: string, now: Date = new Date()): Promise<ArchiveResult> {
  const found = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { archivedAt: true } });
    if (!product) return false;
    if (!product.archivedAt) {
      await tx.product.update({ where: { id }, data: { archivedAt: now } });
    }
    // Reads the archived row back: always a delete op, held until the grace period ends.
    await enqueueProductSync(id, tx);
    return true;
  });
  return found ? { ok: true } : { ok: false, message: ARCHIVE_NOT_FOUND };
}

/**
 * "Rückgängig" / "Wiederherstellen". Lossless: archiving touched nothing but
 * archivedAt. Re-queues the current state, which replaces a still-pending
 * delayed delete (or re-publishes the article if the delete already went out).
 */
export async function restoreArchivedProduct(id: string): Promise<ArchiveResult> {
  const found = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { archivedAt: true } });
    if (!product) return false;
    if (product.archivedAt) {
      await tx.product.update({ where: { id }, data: { archivedAt: null } });
    }
    await enqueueProductSync(id, tx);
    return true;
  });
  if (!found) return { ok: false, message: ARCHIVE_NOT_FOUND };
  triggerBackgroundDrain();
  return { ok: true };
}

/**
 * The second step: hard delete, only for an archived article whose grace
 * period is over. Images go with the row (cascade), order and scan lines keep
 * their nameDe but lose the link (SET NULL). A fresh delete op makes sure the
 * shop drops it even if the delayed one got stuck.
 */
export async function purgeArchivedProduct(id: string, now: Date = new Date()): Promise<ArchiveResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { archivedAt: true, sku: true } });
    if (!product) return { ok: false as const, message: ARCHIVE_NOT_FOUND };
    if (!product.archivedAt) return { ok: false as const, message: PURGE_NOT_ARCHIVED };
    if (!isGracePeriodOver(product.archivedAt, now)) return { ok: false as const, message: PURGE_TOO_EARLY };
    await enqueueProductDeleteSync(id, tx);
    await tx.product.delete({ where: { id } });
    return { ok: true as const, sku: product.sku };
  });
  if (!outcome.ok) return outcome;

  // After the commit, best effort (#3135): the SKU is never issued again
  // (SkuCounter), so its image folder is only ballast now.
  await removeProductImageDir(outcome.sku);
  triggerBackgroundDrain();
  return { ok: true };
}
