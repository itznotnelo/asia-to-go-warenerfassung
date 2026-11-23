import fs from "node:fs";
import path from "node:path";
import { prunePool } from "./engine";
import { TMP_PREFIX, newestVerified, poolDir, removeInterruptedRuns, sha256File, updateStatus } from "./store";
import { BackupDeps, BackupInfo, Pool } from "./types";

// Design 2.5 / files' UX 1.5: copy verified backups into
// <chosen folder>\AsiaToGo-Backups\<pool>\<name>. Only ever adds and prunes
// inside AsiaToGo-Backups. A missing target is a warning, never a failed backup.

export const COPY_DIR_NAME = "AsiaToGo-Backups";
export const COPIED_POOLS: Pool[] = ["daily", "manual", "pre-migrate"];

export type CopyResult = { ok: true; dir: string; pruned: string[] } | { ok: false; missing: boolean; error: string };

export function copyRoot(chosenFolder: string): string {
  return path.join(chosenFolder, COPY_DIR_NAME);
}

export async function copyBackupToTarget(
  deps: Pick<BackupDeps, "backupsRoot" | "now" | "log">,
  backup: BackupInfo,
  chosenFolder: string,
): Promise<CopyResult> {
  if (!fs.existsSync(chosenFolder)) {
    return { ok: false, missing: true, error: `target ${chosenFolder} not present` };
  }
  const root = copyRoot(chosenFolder);
  const pdir = poolDir(root, backup.pool);
  const finalDir = path.join(pdir, backup.name);
  if (fs.existsSync(finalDir)) return { ok: true, dir: finalDir, pruned: [] };
  const tmpDir = path.join(pdir, TMP_PREFIX + backup.name);
  try {
    fs.mkdirSync(pdir, { recursive: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir);
    for (const name of ["db.dump", "images.zip"] as const) {
      const dest = path.join(tmpDir, name);
      await fs.promises.copyFile(path.join(backup.dir, name), dest);
      if ((await sha256File(dest)) !== backup.manifest.files[name].sha256) {
        throw new Error(`${name}: checksum of the copy does not match`);
      }
    }
    await fs.promises.copyFile(path.join(backup.dir, "manifest.json"), path.join(tmpDir, "manifest.json"));
    fs.renameSync(tmpDir, finalDir);
    const pruned = prunePool(root, backup.pool);
    updateStatus(deps, { copyLastOkAt: (deps.now ?? (() => new Date()))().toISOString(), copyLastError: null });
    return { ok: true, dir: finalDir, pruned };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const error = err instanceof Error ? err.message : String(err);
    deps.log.warn("[backup] second copy failed", err);
    updateStatus(deps, { copyLastError: error });
    return { ok: false, missing: false, error };
  }
}

// Hourly catch-up (files' UX 1.5): copy the newest verified local backup if the
// target lacks it, e.g. after the USB stick is plugged back in.
export async function syncNewestToTarget(
  deps: Pick<BackupDeps, "backupsRoot" | "now" | "log">,
  chosenFolder: string,
): Promise<CopyResult | null> {
  const newest = newestVerified(deps.backupsRoot, COPIED_POOLS);
  if (!newest?.manifest) return null;
  if (fs.existsSync(chosenFolder)) removeInterruptedRuns(copyRoot(chosenFolder));
  return copyBackupToTarget(deps, { ...newest, manifest: newest.manifest }, chosenFolder);
}
