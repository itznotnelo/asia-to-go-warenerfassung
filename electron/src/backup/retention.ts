import { Pool } from "./types";

// Design 2.3. Infinity = never auto-deleted.
export const KEEP_PER_POOL: Record<Pool, number> = {
  daily: 14,
  "pre-migrate": 5,
  manual: 14,
  "pre-restore": 3,
  "encoding-migration": Infinity,
};

// Folder names sort by time ("2026-10-30_021500_v0.2.0"). Given the verified
// backups of ONE pool, returns the names to delete: everything past the
// newest `keep`. Never returns the newest backup, so a pool never drops
// below 1. `.tmp-*` names are never returned (a running backup owns them).
export function selectForPrune(names: string[], keep: number): string[] {
  const verified = names.filter((n) => !n.startsWith(".tmp-")).sort().reverse();
  const keepCount = Math.max(1, keep);
  return verified.slice(keepCount);
}

// "YYYY-MM-DD_HHMMSS_v<appVersion>", local time.
export function backupFolderName(now: Date, appVersion: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${date}_${time}_v${appVersion.replace(/[^0-9A-Za-z.-]/g, "-")}`;
}
