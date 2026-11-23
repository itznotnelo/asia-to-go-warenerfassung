import fs from "node:fs";
import path from "node:path";
import { createBackup, verifyBackupFolder } from "./engine";
import { backupFolderName } from "./retention";
import { extractZip } from "./zip";
import { BackupDeps, BackupInfo, Manifest } from "./types";

// Design section 4: one backup folder -> live app. Runs in the main process.

export type RestoreStep = "verify" | "safety" | "db" | "images" | "check";

export interface RestoreHooks {
  // Stop the sync poll and the Next server (design 4.2). Postgres keeps running.
  stopApp: () => Promise<void>;
  // migrate deploy after the restore (design 4.8). Leave out on the
  // update-failure path (the failed version must not migrate again).
  runMigrations?: () => Promise<void>;
  onStep?: (step: RestoreStep) => void;
}

export type RestoreResult =
  | { ok: true; manifest: Manifest; safetyBackup: BackupInfo | null; previousImagesDir: string | null }
  | {
      ok: false;
      step: RestoreStep | "migrate";
      error: string;
      // false = nothing was changed (verify / safety step failed).
      changed: boolean;
      // true = the pre-restore state is back in place ("nichts verloren").
      rolledBack: boolean;
      // App was stopped: caller must start Next again (or show restore.fatal).
      appStopped: boolean;
    };

export const IMAGES_RESTORE_TMP = "images.restore-tmp";
export const IMAGES_BEFORE_RESTORE_PREFIX = "images.before-restore-";
export const IMAGE_SNAPSHOT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function restoreDbFrom(deps: BackupDeps, dir: string, manifest: Manifest): Promise<void> {
  await deps.db.recreateDatabase(deps.conn);
  await deps.tools.restore(deps.conn, path.join(dir, "db.dump"));
  const info = await deps.db.serverInfo(deps.conn);
  if (info.serverEncoding !== "UTF8") throw new Error(`server_encoding is ${info.serverEncoding}, expected UTF8`);
  const counts = await deps.db.rowCounts(deps.conn);
  const diffs = Object.entries(manifest.rowCounts)
    .filter(([table, n]) => counts[table] !== n)
    .map(([table, n]) => `${table}: ${counts[table] ?? "missing"} != ${n}`);
  if (diffs.length) throw new Error(`row counts differ after restore: ${diffs.join("; ")}`);
}

export async function restoreBackup(deps: BackupDeps, backupDir: string, hooks: RestoreHooks): Promise<RestoreResult> {
  const now = (deps.now ?? (() => new Date()))();
  const userData = path.dirname(deps.imagesDir);
  const imagesTmp = path.join(userData, IMAGES_RESTORE_TMP);

  // 4.1 Check the chosen backup. Nothing changed yet.
  hooks.onStep?.("verify");
  let manifest: Manifest;
  try {
    manifest = await verifyBackupFolder(deps, backupDir);
  } catch (err) {
    return { ok: false, step: "verify", error: msg(err), changed: false, rolledBack: false, appStopped: false };
  }

  // 4.2 Stop sync poll + Next before anything touches the DB.
  await hooks.stopApp();

  // 4.3 Safety copy of the current state. Skipped only if the DB is unreadable.
  hooks.onStep?.("safety");
  let safetyBackup: BackupInfo | null = null;
  let currentReadable = true;
  try {
    await deps.db.rowCounts(deps.conn);
  } catch (err) {
    currentReadable = false;
    deps.log.warn("[restore] current database unreadable, no pre-restore copy possible", err);
  }
  if (currentReadable) {
    const safety = await createBackup(deps, "pre-restore");
    if (!safety.ok) {
      return {
        ok: false,
        step: "safety",
        error: `pre-restore backup failed (${safety.reason}): ${safety.error}`,
        changed: false,
        rolledBack: false,
        appStopped: true,
      };
    }
    safetyBackup = safety.backup;
  }

  // 4.7 (first half) Unpack images before the DB is dropped, so after the DB
  // step only two renames are left.
  hooks.onStep?.("images");
  try {
    fs.rmSync(imagesTmp, { recursive: true, force: true });
    const n = await extractZip(path.join(backupDir, "images.zip"), imagesTmp);
    if (n !== manifest.imageCount) throw new Error(`unpacked ${n} images, manifest says ${manifest.imageCount}`);
  } catch (err) {
    fs.rmSync(imagesTmp, { recursive: true, force: true });
    return { ok: false, step: "images", error: msg(err), changed: false, rolledBack: false, appStopped: true };
  }

  // 4.4-4.6 Drop/create, single-transaction restore, verify counts + encoding.
  hooks.onStep?.("db");
  try {
    await restoreDbFrom(deps, backupDir, manifest);
  } catch (err) {
    fs.rmSync(imagesTmp, { recursive: true, force: true });
    const error = msg(err);
    deps.log.error("[restore] restore failed, putting the pre-restore state back", err);
    let rolledBack = false;
    if (safetyBackup) {
      try {
        await restoreDbFrom(deps, safetyBackup.dir, safetyBackup.manifest);
        rolledBack = true;
      } catch (rbErr) {
        deps.log.error("[restore] ROLLBACK FAILED", rbErr);
      }
    }
    return { ok: false, step: "db", error, changed: true, rolledBack, appStopped: true };
  }

  // 4.7 (second half) Swap the image folder; keep the old one 7 days.
  let previousImagesDir: string | null = null;
  if (fs.existsSync(deps.imagesDir)) {
    previousImagesDir = path.join(userData, IMAGES_BEFORE_RESTORE_PREFIX + backupFolderName(now, deps.appVersion));
    fs.renameSync(deps.imagesDir, previousImagesDir);
  }
  fs.renameSync(imagesTmp, deps.imagesDir);

  // 4.8 Bring an older dump up to the current schema.
  hooks.onStep?.("check");
  if (hooks.runMigrations) {
    try {
      await hooks.runMigrations();
    } catch (err) {
      return { ok: false, step: "migrate", error: msg(err), changed: true, rolledBack: false, appStopped: true };
    }
  }
  deps.log.info(`[restore] restored ${backupDir}`);
  return { ok: true, manifest, safetyBackup, previousImagesDir };
}

// images.before-restore-* older than 7 days (files' UX 4). Call at boot.
export function pruneImageSnapshots(imagesDir: string, now: Date = new Date()): string[] {
  const userData = path.dirname(imagesDir);
  if (!fs.existsSync(userData)) return [];
  const removed: string[] = [];
  for (const ent of fs.readdirSync(userData, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith(IMAGES_BEFORE_RESTORE_PREFIX)) continue;
    const dir = path.join(userData, ent.name);
    // Age from the name (a rename keeps the folder's old mtime).
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(ent.name.slice(IMAGES_BEFORE_RESTORE_PREFIX.length));
    if (!m) continue;
    const takenAt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    if (now.getTime() - takenAt > IMAGE_SNAPSHOT_KEEP_MS) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(ent.name);
    }
  }
  return removed;
}
