import fs from "node:fs";
import path from "node:path";
import { createBackup } from "./engine";
import { readStatus, updateStatus } from "./store";
import { BackupDeps, BackupInfo, FailureReason } from "./types";

// Design 3.3: a pending migration only runs after a verified pre-migrate
// backup. A failed backup means no migrate, ever.

// Folder names under prisma/migrations that hold a migration.sql, sorted.
export function migrationFolders(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(migrationsDir, e.name, "migration.sql")))
    .map((e) => e.name)
    .sort();
}

// null applied = no _prisma_migrations table = fresh database.
export function pendingMigrations(shipped: string[], applied: string[] | null): string[] {
  if (applied === null) return shipped;
  const done = new Set(applied);
  return shipped.filter((m) => !done.has(m));
}

export type MigrateOutcome =
  // Fresh database (no _prisma_migrations): nothing to back up, migrated.
  | { status: "fresh" }
  // Nothing pending: migrate deploy ran as a no-op, no backup taken.
  | { status: "up-to-date" }
  | { status: "migrated"; backup: BackupInfo; pending: string[] }
  // Pre-migrate backup failed: runMigrations was NOT called, data untouched.
  // UI: "Update wartet" (files' UX 3.3), reason -> backup.reason.*.
  | { status: "blocked"; reason: FailureReason; error: string; pending: string[] }
  // migrate deploy failed (P3009/P3018). Offer restoring `backupDir`
  // (files' UX 3.1), then call markWaitingForFix().
  | { status: "migrate-failed"; backupDir: string; error: string }
  // This version already failed and its pre-update state was restored.
  // UI: "Die App wartet auf eine reparierte Version" (files' UX 3.1).
  | { status: "waiting-for-fix"; appVersion: string };

export interface MigrateHookOptions {
  migrationsDir: string; // prismaDir()/migrations
  runMigrations: () => Promise<void>; // migrate.ts runMigrations(databaseUrl)
}

export async function migrateWithBackup(deps: BackupDeps, opts: MigrateHookOptions): Promise<MigrateOutcome> {
  let status = readStatus(deps.backupsRoot);
  // A new release clears the "failed on version X" state.
  if (
    (status.failedMigration && status.failedMigration.appVersion !== deps.appVersion) ||
    (status.failedMigrationAppVersion && status.failedMigrationAppVersion !== deps.appVersion)
  ) {
    status = updateStatus(deps, { failedMigration: null, failedMigrationAppVersion: null });
  }

  const applied = await deps.db.appliedMigrations(deps.conn);
  const pending = pendingMigrations(migrationFolders(opts.migrationsDir), applied);

  if (applied === null) {
    await opts.runMigrations();
    return { status: "fresh" };
  }
  if (pending.length === 0) {
    await opts.runMigrations();
    return { status: "up-to-date" };
  }

  if (status.failedMigrationAppVersion === deps.appVersion) {
    return { status: "waiting-for-fix", appVersion: deps.appVersion };
  }
  if (status.failedMigration?.appVersion === deps.appVersion) {
    return { status: "migrate-failed", backupDir: status.failedMigration.backupDir, error: status.failedMigration.error };
  }

  const result = await createBackup(deps, "pre-migrate");
  if (!result.ok) {
    deps.log.error(`[backup] pre-migrate backup failed (${result.reason}); NOT migrating ${pending.join(", ")}`);
    return { status: "blocked", reason: result.reason, error: result.error, pending };
  }

  try {
    await opts.runMigrations();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    updateStatus(deps, {
      failedMigration: {
        appVersion: deps.appVersion,
        backupDir: result.backup.dir,
        error,
        at: (deps.now ?? (() => new Date()))().toISOString(),
      },
    });
    return { status: "migrate-failed", backupDir: result.backup.dir, error };
  }
  return { status: "migrated", backup: result.backup, pending };
}

// After the pre-update backup was restored (files' UX 3.1).
export function markWaitingForFix(deps: Pick<BackupDeps, "backupsRoot" | "now" | "appVersion">): void {
  updateStatus(deps, { failedMigrationAppVersion: deps.appVersion });
}
