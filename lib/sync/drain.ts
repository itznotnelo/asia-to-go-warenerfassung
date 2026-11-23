import "server-only";
import { prisma } from "@/lib/prisma";
import { publishOps, SyncHttpError } from "./client";
import { hasShopSyncSettings, type PublishOp, type ShopSyncSettingsValue } from "./types";

export const MAX_ATTEMPTS = 8;
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
 * Rows the next batch may take: not stuck, and not held back by a grace
 * period (the delayed shop delete of an archived product, review should #34).
 */
export function readyToSend(now: Date) {
  return {
    attempts: { lt: MAX_ATTEMPTS },
    OR: [{ notBefore: null }, { notBefore: { lte: now } }],
  };
}

/** Categories go first so a brand-new category referenced by a product in the same batch doesn't trip the backend's foreign-key check. */
export function sortForPublish(rows: OutboxRow[]): OutboxRow[] {
  return [...rows].sort((a, b) => (a.entityType === b.entityType ? 0 : a.entityType === "category" ? -1 : 1));
}

/**
 * Only a 4xx the backend will give again on retry (bad payload, revoked
 * device key) counts toward MAX_ATTEMPTS. No internet, a timeout, a 5xx,
 * 408 or 429 says nothing about the ops, so the shop can stay offline for
 * days without losing a queued change.
 */
export function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof SyncHttpError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export interface DrainResult {
  sent: number;
  /** Rows the backend rejected MAX_ATTEMPTS times. Kept (never deleted unsent), skipped until "Alles synchronisieren" retries them. */
  stuck: number;
  failed: number;
  skippedNoSettings: boolean;
}

export function countStuckOutbox(): Promise<number> {
  return prisma.syncOutbox.count({ where: { attempts: { gte: MAX_ATTEMPTS } } });
}

/** Gives stuck rows (including deletes, which no product re-save can re-queue) a fresh set of attempts. */
export async function retryStuckOutbox(): Promise<void> {
  await prisma.syncOutbox.updateMany({ where: { attempts: { gte: MAX_ATTEMPTS } }, data: { attempts: 0 } });
}

/**
 * Drains the SyncOutbox in one /publish call. All-or-nothing per call (a
 * network failure fails the whole batch, not op-by-op) is fine because every
 * op is independently idempotent on the backend - a retried batch just
 * re-applies the same upserts/deletes.
 */
export async function drainOutbox(settings: ShopSyncSettingsValue): Promise<DrainResult> {
  if (!hasShopSyncSettings(settings)) {
    return { sent: 0, stuck: 0, failed: 0, skippedNoSettings: true };
  }

  // Stuck rows stay out of the batch, otherwise one rejected op would fail
  // every publish and nothing else would reach the website.
  const rows = (await prisma.syncOutbox.findMany({
    where: readyToSend(new Date()),
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  })) as unknown as OutboxRow[];
  const toSend = sortForPublish(rows);

  if (toSend.length === 0) {
    return { sent: 0, stuck: await countStuckOutbox(), failed: 0, skippedNoSettings: false };
  }

  try {
    await publishOps(settings, toSend.map((r) => r.payload));
    await prisma.syncOutbox.deleteMany({ where: unchangedSince(toSend) });
    return { sent: toSend.length, stuck: await countStuckOutbox(), failed: 0, skippedNoSettings: false };
  } catch (error) {
    const message = String(error).slice(0, 500);
    // Same guard as the delete: a payload saved during the failed publish
    // starts fresh (attempts 0) and must not inherit this failure.
    await prisma.syncOutbox.updateMany({
      where: unchangedSince(toSend),
      data: isPermanentFailure(error) ? { attempts: { increment: 1 }, lastError: message } : { lastError: message },
    });
    return { sent: 0, stuck: await countStuckOutbox(), failed: toSend.length, skippedNoSettings: false };
  }
}
