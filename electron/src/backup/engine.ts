import fs from "node:fs";
import path from "node:path";
import { KEEP_PER_POOL, backupFolderName, selectForPrune } from "./retention";
import {
  TMP_PREFIX,
  defaultFreeBytes,
  listBackups,
  newestVerified,
  poolDir,
  readManifest,
  readStatus,
  sha256File,
  updateStatus,
} from "./store";
import { readZipEntries, testZip, writeZip } from "./zip";
import { BackupDeps, BackupError, BackupInfo, BackupResult, FailureReason, Manifest, Pool } from "./types";

const MB = 1024 * 1024;
export const FIRST_RUN_MIN_FREE = 1024 * MB;
export const FREE_SPACE_MARGIN = 500 * MB;

function nowOf(deps: BackupDeps): Date {
  return (deps.now ?? (() => new Date()))();
}

function reasonOf(err: unknown): FailureReason {
  if (err instanceof BackupError) return err.reason;
  if ((err as NodeJS.ErrnoException)?.code === "ENOSPC") return "diskFull";
  return "unknown";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Design 2.4: free >= 2 x (last db.dump + last images.zip) + 500 MB, first run 1 GB.
export async function requiredFreeBytes(backupsRoot: string): Promise<number> {
  const last = newestVerified(backupsRoot);
  if (!last?.manifest) return FIRST_RUN_MIN_FREE;
  const f = last.manifest.files;
  return 2 * (f["db.dump"].bytes + f["images.zip"].bytes) + FREE_SPACE_MARGIN;
}

export async function checkFreeSpace(deps: BackupDeps): Promise<void> {
  fs.mkdirSync(deps.backupsRoot, { recursive: true });
  const free = await (deps.freeBytes ?? defaultFreeBytes)(deps.backupsRoot);
  const need = await requiredFreeBytes(deps.backupsRoot);
  if (free < need) {
    throw new BackupError("diskFull", `free ${Math.round(free / MB)} MB < needed ${Math.round(need / MB)} MB`);
  }
}

// Design 2.2 steps 2-4 on a written dump + zip. Throws BackupError("corrupt").
export async function verifyArchive(
  deps: Pick<BackupDeps, "tools">,
  dir: string,
  expectTables: string[],
  expectImages: number,
): Promise<Manifest["verified"]> {
  const dump = path.join(dir, "db.dump");
  const zip = path.join(dir, "images.zip");
  if (!fs.existsSync(dump) || fs.statSync(dump).size === 0) throw new BackupError("corrupt", "db.dump missing or empty");

  let listed: string[];
  try {
    listed = await deps.tools.listTableData(dump);
  } catch (err) {
    throw new BackupError(reasonOf(err) === "toolMissing" ? "toolMissing" : "corrupt", `pg_restore --list: ${messageOf(err)}`);
  }
  const missing = expectTables.filter((t) => !listed.includes(t));
  if (missing.length) throw new BackupError("corrupt", `dump TOC lacks TABLE DATA for: ${missing.join(", ")}`);

  try {
    await deps.tools.fullRead(dump);
  } catch (err) {
    throw new BackupError(reasonOf(err) === "toolMissing" ? "toolMissing" : "corrupt", `pg_restore full read: ${messageOf(err)}`);
  }

  let entries: number;
  try {
    entries = await testZip(zip);
  } catch (err) {
    throw new BackupError("corrupt", `images.zip: ${messageOf(err)}`);
  }
  if (entries !== expectImages) throw new BackupError("corrupt", `images.zip has ${entries} entries, expected ${expectImages}`);
  return { pgRestoreList: true, pgRestoreFullRead: true, zipTest: true };
}

// Before a restore (design 4.1) or a second-copy check: sha256 against the
// manifest, then the same checks as at creation time.
export async function verifyBackupFolder(deps: Pick<BackupDeps, "tools">, dir: string): Promise<Manifest> {
  const manifest = readManifest(dir);
  if (!manifest) throw new BackupError("corrupt", "manifest.json missing or unreadable");
  for (const name of ["db.dump", "images.zip"] as const) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw new BackupError("corrupt", `${name} missing`);
    const sha = await sha256File(file);
    if (sha !== manifest.files[name].sha256) throw new BackupError("corrupt", `${name} sha256 mismatch`);
  }
  await verifyArchive(deps, dir, Object.keys(manifest.rowCounts), manifest.imageCount);
  return manifest;
}

function uniqueName(pdir: string, base: string): string {
  let name = base;
  for (let i = 2; fs.existsSync(path.join(pdir, name)) || fs.existsSync(path.join(pdir, TMP_PREFIX + name)); i++) {
    name = `${base}-${i}`;
  }
  return name;
}

// Deletes old backups of ONE pool (design 2.3). Only called after a new
// backup of that pool verified OK.
export function prunePool(backupsRoot: string, pool: Pool): string[] {
  const names = listBackups(backupsRoot, [pool]).map((b) => b.name);
  const doomed = selectForPrune(names, KEEP_PER_POOL[pool]);
  for (const name of doomed) fs.rmSync(path.join(poolDir(backupsRoot, pool), name), { recursive: true, force: true });
  return doomed;
}

// One backup run (design 2): free-space check, dump, images.zip, verify,
// manifest, rename, prune. Any failure removes the .tmp folder and prunes nothing.
export async function createBackup(deps: BackupDeps, pool: Pool): Promise<BackupResult> {
  const started = nowOf(deps);
  const pdir = poolDir(deps.backupsRoot, pool);
  let tmpDir: string | null = null;
  try {
    await checkFreeSpace(deps);
    fs.mkdirSync(pdir, { recursive: true });
    const name = uniqueName(pdir, backupFolderName(started, deps.appVersion));
    tmpDir = path.join(pdir, TMP_PREFIX + name);
    fs.mkdirSync(tmpDir);

    const info = await deps.db.serverInfo(deps.conn);
    const migrations = (await deps.db.appliedMigrations(deps.conn)) ?? [];
    const rowCounts = await deps.db.rowCounts(deps.conn);

    // DB first, then images (design 2): a newer image is a harmless orphan.
    const dumpFile = path.join(tmpDir, "db.dump");
    await deps.tools.dump(deps.conn, dumpFile);
    const zipFile = path.join(tmpDir, "images.zip");
    const imageCount = await writeZip(deps.imagesDir, zipFile);

    const verified = await verifyArchive(deps, tmpDir, Object.keys(rowCounts), imageCount);
    // Re-read the central directory once more: proves the file on disk, not a buffer.
    if ((await readZipEntries(zipFile)).length !== imageCount) throw new BackupError("corrupt", "images.zip entry count changed");

    const manifest: Manifest = {
      kind: pool,
      createdAt: started.toISOString(),
      appVersion: deps.appVersion,
      serverVersion: info.serverVersion,
      serverEncoding: info.serverEncoding,
      datcollate: info.datcollate,
      lastMigration: migrations.length ? migrations[migrations.length - 1] : null,
      migrations,
      rowCounts,
      imageCount,
      files: {
        "db.dump": { bytes: fs.statSync(dumpFile).size, sha256: await sha256File(dumpFile) },
        "images.zip": { bytes: fs.statSync(zipFile).size, sha256: await sha256File(zipFile) },
      },
      verified,
    };
    fs.writeFileSync(path.join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const finalDir = path.join(pdir, name);
    fs.renameSync(tmpDir, finalDir);
    tmpDir = null;

    const pruned = prunePool(deps.backupsRoot, pool);
    updateStatus(deps, {
      lastOkAt: started.toISOString(),
      lastOkPool: pool,
      lastAttemptAt: started.toISOString(),
      lastError: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    });
    deps.log.info(`[backup] ${pool}/${name} ok (${imageCount} images), pruned ${pruned.length}`);
    const backup: BackupInfo = { pool, name, dir: finalDir, manifest };
    return { ok: true, backup, pruned };
  } catch (err) {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    const reason = reasonOf(err);
    deps.log.error(`[backup] ${pool} failed (${reason})`, err);
    try {
      const prev = readStatus(deps.backupsRoot);
      updateStatus(deps, {
        lastAttemptAt: started.toISOString(),
        lastError: reason,
        lastErrorMessage: messageOf(err),
        consecutiveFailures: prev.consecutiveFailures + 1,
      });
    } catch (statusErr) {
      deps.log.error("[backup] could not write status.json", statusErr);
    }
    return { ok: false, reason, error: messageOf(err) };
  }
}

// Design 2.3: daily runs when the newest daily is older than 20 h.
export const DAILY_MIN_AGE_MS = 20 * 60 * 60 * 1000;

export function isDailyDue(deps: Pick<BackupDeps, "backupsRoot" | "now">): boolean {
  const newest = newestVerified(deps.backupsRoot, ["daily"]);
  if (!newest?.manifest) return true;
  const now = (deps.now ?? (() => new Date()))().getTime();
  return now - new Date(newest.manifest.createdAt).getTime() >= DAILY_MIN_AGE_MS;
}

// Single-flight wrapper: one pg_dump at a time. A second request while one
// runs joins the running one (files' UX 1.4: the button joins the daily run).
export class BackupRunner {
  private running: Promise<BackupResult> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: BackupDeps) {}

  get busy(): boolean {
    return this.running !== null;
  }

  run(pool: Pool): Promise<BackupResult> {
    if (this.running) return this.running;
    this.running = createBackup(this.deps, pool).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async runDailyIfDue(): Promise<BackupResult | null> {
    if (this.running || !isDailyDue(this.deps)) return null;
    return this.run("daily");
  }

  // Boot check + hourly timer (design 2.3). Returns immediately.
  startDailySchedule(intervalMs = 60 * 60 * 1000): void {
    this.stopDailySchedule();
    const tick = () => {
      this.runDailyIfDue().catch((err) => this.deps.log.error("[backup] daily tick failed", err));
    };
    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stopDailySchedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // For before-quit (files' UX 1.4) and before a restore.
  async waitIdle(): Promise<void> {
    if (this.running) await this.running.catch(() => undefined);
  }
}
