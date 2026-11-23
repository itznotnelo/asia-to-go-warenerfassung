import { daysUntil } from "./dates";

export interface LotInput {
  id: string;
  expiryDate: Date | null;
  receivedAt: Date;
  /** Sum of the movements linked to this lot (receipt, lot write-off, undo). */
  ownQty: number;
}

export interface AllocatedLot extends LotInput {
  /** Part of the current stock attributed to this lot. */
  remaining: number;
}

/** FEFO: earliest MHD first, lots without MHD last, ties by delivery date. */
export function compareFefo(a: LotInput, b: LotInput): number {
  if (a.expiryDate && b.expiryDate) {
    const diff = a.expiryDate.getTime() - b.expiryDate.getTime();
    if (diff !== 0) return diff;
  } else if (a.expiryDate) {
    return -1;
  } else if (b.expiryDate) {
    return 1;
  }
  return a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id);
}

/**
 * Sales are not linked to a lot, so which lots are still on the shelf is
 * derived: the shop sells FEFO, so what is left of the stock sits in the lots
 * that expire last. Walks the lots from the back of the FEFO order and gives
 * each at most its own quantity. Stock without any lot (opening stock,
 * count corrections) is assumed sold first, which errs on the side of
 * warning about expiry rather than missing one. Returned in FEFO order.
 */
export function allocateStockToLots(stock: number, lots: LotInput[]): AllocatedLot[] {
  const ordered = [...lots].sort(compareFefo);
  const remaining = new Map<string, number>();
  let rest = Math.max(0, stock);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const take = Math.min(Math.max(0, ordered[i].ownQty), rest);
    remaining.set(ordered[i].id, take);
    rest -= take;
  }
  return ordered.map((lot) => ({ ...lot, remaining: remaining.get(lot.id) ?? 0 }));
}

/** The lot to sell first (FEFO hint): the earliest-expiring lot that still has stock. */
export function fefoNext(allocated: AllocatedLot[]): AllocatedLot | null {
  return allocated.find((lot) => lot.remaining > 0 && lot.expiryDate !== null) ?? null;
}

export type ExpiryBucket = "expired" | "week" | "month" | "later";

/** Expired, within 7 days, within 30 days, later. */
export function expiryBucket(expiry: Date, now: Date = new Date()): ExpiryBucket {
  const days = daysUntil(expiry, now);
  if (days < 0) return "expired";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

/** "abgelaufen seit 3 Tagen", "läuft heute ab", "noch 5 Tage". */
export function expiryText(expiry: Date, now: Date = new Date()): string {
  const days = daysUntil(expiry, now);
  if (days < -1) return `abgelaufen seit ${-days} Tagen`;
  if (days === -1) return "seit gestern abgelaufen";
  if (days === 0) return "läuft heute ab";
  if (days === 1) return "läuft morgen ab";
  return `noch ${days} Tage`;
}
