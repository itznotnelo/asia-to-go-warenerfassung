// No "server-only": the edit form shows the grace period too.

/**
 * How long a "gelöschtes" (archived) article stays in the webshop before its
 * delete op is sent (review should #34). Inside this window "Rückgängig" or
 * "Wiederherstellen" never touches the website; "Endgültig löschen" is only
 * offered after it.
 */
export const SHOP_DELETE_GRACE_MS = 5 * 60 * 1000;

export const SHOP_DELETE_GRACE_MINUTES = SHOP_DELETE_GRACE_MS / 60_000;

/** When the shop delete of a product archived at `archivedAt` may go out. */
export function shopDeleteDueAt(archivedAt: Date): Date {
  return new Date(archivedAt.getTime() + SHOP_DELETE_GRACE_MS);
}

/** True once the grace period is over, i.e. the shop delete was due and a final purge is allowed. */
export function isGracePeriodOver(archivedAt: Date, now: Date): boolean {
  return shopDeleteDueAt(archivedAt).getTime() <= now.getTime();
}
