import path from "node:path";
import { pgDbOps } from "./db";
import { createPgTools, pgToolPath } from "./pg-tools";
import { BackupDeps, Logger, PgConnection } from "./types";

// Public surface of the backup engine. Wiring into main.ts: see web's note on #3060.

export * from "./types";
export { BackupRunner, createBackup, checkFreeSpace, isDailyDue, prunePool, verifyArchive, verifyBackupFolder } from "./engine";
export { listBackups, newestVerified, readManifest, readStatus, removeInterruptedRuns, updateStatus } from "./store";
export type { BackupListEntry, BackupStatus } from "./store";
export { migrateWithBackup, markWaitingForFix, pendingMigrations, migrationFolders } from "./migrate-hook";
export type { MigrateOutcome } from "./migrate-hook";
export { restoreBackup, pruneImageSnapshots } from "./restore";
export type { RestoreHooks, RestoreResult, RestoreStep } from "./restore";
export { copyBackupToTarget, syncNewestToTarget, copyRoot } from "./second-copy";
export { checkPgTools, createPgTools, pgToolPath } from "./pg-tools";
// For the WIN1252 -> UTF8 migration (must 1, web): dump/verify with
// tools.dump + verifyArchive, new db with recreateUtf8Database, load with tools.restore.
export { readRowCounts, readServerInfo, readAppliedMigrations, recreateUtf8Database } from "./db";

// "postgresql://user:pw@127.0.0.1:port/db?schema=public" (RunningPostgres.databaseUrl)
export function connFromDatabaseUrl(databaseUrl: string): PgConnection {
  const u = new URL(databaseUrl);
  return {
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export interface ProductionDepsOptions {
  userDataDir: string; // app.getPath("userData")
  resourcesRoot: string; // process.resourcesPath when packaged
  isPackaged: boolean;
  appVersion: string; // app.getVersion()
  databaseUrl: string;
  log: Logger;
}

export function productionDeps(o: ProductionDepsOptions): BackupDeps {
  return {
    backupsRoot: path.join(o.userDataDir, "backups"),
    imagesDir: path.join(o.userDataDir, "images"),
    appVersion: o.appVersion,
    conn: connFromDatabaseUrl(o.databaseUrl),
    tools: createPgTools((tool) => pgToolPath(tool, o.resourcesRoot, o.isPackaged)),
    db: pgDbOps,
    log: o.log,
  };
}
