import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BackupDeps, FailureReason, Manifest, POOLS, Pool } from "./types";

// On-disk layout (design 2): <backupsRoot>/<pool>/<name>/{db.dump,images.zip,manifest.json}
// plus <backupsRoot>/status.json (files' UX spec 3.4).

export const TMP_PREFIX = ".tmp-";

export interface BackupListEntry {
  pool: Pool;
  name: string;
  dir: string;
  // null = manifest missing or unreadable ("beschädigt" in the UI, never restorable).
  manifest: Manifest | null;
}

export function poolDir(backupsRoot: string, pool: Pool): string {
  return path.join(backupsRoot, pool);
}

export function readManifest(dir: string): Manifest | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
    if (!m || typeof m !== "object" || !m.files?.["db.dump"]?.sha256 || !m.files?.["images.zip"]?.sha256) return null;
    if (!m.rowCounts || typeof m.rowCounts !== "object") return null;
    return m;
  } catch {
    return null;
  }
}

// Finished backups only (never .tmp-*), newest first across the given pools.
export function listBackups(backupsRoot: string, pools: Pool[] = POOLS): BackupListEntry[] {
  const out: BackupListEntry[] = [];
  for (const pool of pools) {
    const pdir = poolDir(backupsRoot, pool);
    if (!fs.existsSync(pdir)) continue;
    for (const ent of fs.readdirSync(pdir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(TMP_PREFIX) || ent.name.startsWith(".")) continue;
      const dir = path.join(pdir, ent.name);
      out.push({ pool, name: ent.name, dir, manifest: readManifest(dir) });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

// Newest backup with a readable manifest that passed every check at creation.
export function newestVerified(backupsRoot: string, pools: Pool[] = POOLS): BackupListEntry | null {
  return (
    listBackups(backupsRoot, pools).find(
      (b) => b.manifest && b.manifest.verified.pgRestoreList && b.manifest.verified.pgRestoreFullRead && b.manifest.verified.zipTest,
    ) ?? null
  );
}

// A .tmp-* folder at startup is a crashed or killed run (design 2): delete it,
// never count it. Call once at boot, before any backup can start.
export function removeInterruptedRuns(backupsRoot: string): string[] {
  const removed: string[] = [];
  for (const pool of POOLS) {
    const pdir = poolDir(backupsRoot, pool);
    if (!fs.existsSync(pdir)) continue;
    for (const ent of fs.readdirSync(pdir, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name.startsWith(TMP_PREFIX)) {
        fs.rmSync(path.join(pdir, ent.name), { recursive: true, force: true });
        removed.push(`${pool}/${ent.name}`);
      }
    }
  }
  return removed;
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function defaultFreeBytes(dir: string): Promise<number> {
  const s = await fs.promises.statfs(dir);
  return Number(s.bavail) * Number(s.bsize);
}

// ---- status.json ----

export interface BackupStatus {
  lastOkAt: string | null;
  lastOkPool: Pool | null;
  lastAttemptAt: string | null;
  lastError: FailureReason | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  copyLastOkAt: string | null;
  copyLastError: string | null;
  // `migrate deploy` failed on this app version; the pre-migrate backup to offer.
  // Not retried on the same version (it would fail again and, worse, rotate
  // the real pre-update backup out of the pool with half-migrated copies).
  failedMigration: { appVersion: string; backupDir: string; error: string; at: string } | null;
  // Set after the pre-update state was restored: wait for a fixed release (design 3.3.4).
  failedMigrationAppVersion: string | null;
  toolProblem: string | null;
  updatedAt: string | null;
}

const EMPTY_STATUS: BackupStatus = {
  lastOkAt: null,
  lastOkPool: null,
  lastAttemptAt: null,
  lastError: null,
  lastErrorMessage: null,
  consecutiveFailures: 0,
  copyLastOkAt: null,
  copyLastError: null,
  failedMigration: null,
  failedMigrationAppVersion: null,
  toolProblem: null,
  updatedAt: null,
};

function statusPath(backupsRoot: string): string {
  return path.join(backupsRoot, "status.json");
}

export function readStatus(backupsRoot: string): BackupStatus {
  try {
    return { ...EMPTY_STATUS, ...JSON.parse(fs.readFileSync(statusPath(backupsRoot), "utf8")) };
  } catch {
    return { ...EMPTY_STATUS };
  }
}

export function updateStatus(deps: Pick<BackupDeps, "backupsRoot" | "now">, patch: Partial<BackupStatus>): BackupStatus {
  const next = { ...readStatus(deps.backupsRoot), ...patch, updatedAt: (deps.now ?? (() => new Date()))().toISOString() };
  fs.mkdirSync(deps.backupsRoot, { recursive: true });
  const file = statusPath(deps.backupsRoot);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return next;
}
