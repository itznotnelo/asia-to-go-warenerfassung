import "server-only";
import { prisma } from "@/lib/prisma";
import { publishOps } from "./client";
import { hasShopSyncSettings, type PublishOp, type ShopSyncSettingsValue } from "./types";

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 200;

export interface OutboxRow {
  id: string;
  entityType: string;
  payload: PublishOp;
  attempts: number;
  updatedAt: Date;
}

/**
 * Matches only rows still holding the payload this pass read. A save during
 * the publish upserts the same row (same id, new updatedAt), so the newer
 * payload survives for the next pass instead of being deleted unsent.
 */
export function unchangedSince(rows: OutboxRow[]) {
  return { OR: rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt })) };
}

/**
 * Pure triage: rows that have failed MAX_ATTEMPTS times are dropped instead
 * of retried forever (a permanently broken op - bad payload, revoked device
 * key - shouldn't jam the queue for every other product). Categories go
 * first so a brand-new category referenced by a product in the same batch
 * doesn't trip the backend's foreign-key check.
 */
export function partitionForDrain(rows: OutboxRow[]): { toSend: OutboxRow[]; toDrop: OutboxRow[] } {
  const toSend: OutboxRow[] = [];
  const toDrop: OutboxRow[] = [];
  for (const row of rows) {
    (row.attempts >= MAX_ATTEMPTS ? toDrop : toSend).push(row);
  }
  toSend.sort((a, b) => (a.entityType === b.entityType ? 0 : a.entityType === "category" ? -1 : 1));
  return { toSend, toDrop };
}

export interface DrainResult {
  sent: number;
  dropped: number;
  failed: number;
  skippedNoSettings: boolean;
}

/**
 * Drains the whole SyncOutbox in one /publish call. All-or-nothing per
 * call (a network failure fails the whole batch, not op-by-op) is fine
 * because every op is independently idempotent on the backend - a retried
 * batch just re-applies the same upserts/deletes.
 */
export async function drainOutbox(settings: ShopSyncSettingsValue): Promise<DrainResult> {
  if (!hasShopSyncSettings(settings)) {
    return { sent: 0, dropped: 0, failed: 0, skippedNoSettings: true };
  }

  const rows = (await prisma.syncOutbox.findMany({
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  })) as unknown as OutboxRow[];

  const { toSend, toDrop } = partitionForDrain(rows);

  if (toDrop.length > 0) {
    await prisma.syncOutbox.deleteMany({ where: unchangedSince(toDrop) });
  }
  if (toSend.length === 0) {
    return { sent: 0, dropped: toDrop.length, failed: 0, skippedNoSettings: false };
  }

  try {
    await publishOps(settings, toSend.map((r) => r.payload));
    await prisma.syncOutbox.deleteMany({ where: unchangedSince(toSend) });
    return { sent: toSend.length, dropped: toDrop.length, failed: 0, skippedNoSettings: false };
  } catch (error) {
    const message = String(error).slice(0, 500);
    // Same guard as the delete: a payload saved during the failed publish
    // starts fresh (attempts 0) and must not inherit this failure.
    await prisma.syncOutbox.updateMany({
      where: unchangedSince(toSend),
      data: { attempts: { increment: 1 }, lastError: message },
    });
    return { sent: 0, dropped: toDrop.length, failed: toSend.length, skippedNoSettings: false };
  }
}
