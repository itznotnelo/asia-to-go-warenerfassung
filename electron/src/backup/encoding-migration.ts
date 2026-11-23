import fs from "node:fs";
import path from "node:path";
import { FREE_SPACE_MARGIN, createBackup } from "./engine";
import { defaultFreeBytes, listBackups } from "./store";
import { BackupDeps, BackupError, FailureReason, Manifest, PgConnection } from "./types";

// One-time WIN1252 -> UTF8 migration of the existing shop-laptop cluster
// (#3060 must 1, design 5.1). Old pgdata is never written to: the new cluster
// is built in pgdata-utf8, verified, and only then swapped in by two renames.
// Every step is recorded in userData/encoding-migration.json, so a crash or
// power loss resumes (after verify) or rolls back (before verify) on the next
// boot via recoverEncodingMigration().
//
// Like the rest of backup/, nothing here imports electron or embedded-postgres:
// the cluster lifecycle comes in as ClusterOps (encoding-cluster.ts in
// production, a fake in tests).

export const STATE_FILE = "encoding-migration.json";
export const NEW_DIR_NAME = "pgdata-utf8";
export const ARCHIVE_PREFIX = "pgdata-win1252-";
// Design 5.1.12: keep the old cluster 30 days AND until 3 verified UTF8 dailies exist.
export const ARCHIVE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const ARCHIVE_MIN_DAILIES = 3;
// Crashes (power loss, kill) before verify; after that the app refuses to start.
export const MAX_CRASHED_ATTEMPTS = 3;
// Design 5.1.8: must come back byte-identical from the new cluster.
export const ROUND_TRIP_TEXT = "Würzöl Pfeffer – scharf € / 辛拉面 / มาม่า";
export const SAMPLE_COUNT = 3;

// German text for the boot dialog (design 5.1, failure path).
export const MESSAGE_FAILED = "Datenbank-Umstellung fehlgeschlagen, keine Daten verloren. Bitte HQ melden.";

export type MigrationStep =
  | "backup"
  | "stop-old"
  | "init-new"
  | "restore"
  | "verify"
  // New cluster verified and stopped; the swap may be half done.
  | "verified"
  | "done"
  | "failed"
  // Crashed before verify, pgdata-utf8 removed on the next boot; will run again.
  | "rolled-back";

export interface EncodingMigrationState {
  step: MigrationStep;
  appVersion: string;
  startedAt: string;
  oldDir: string;
  newDir: string;
  // Set before the first rename (step "verified"), so a crash mid-swap can finish it.
  archivedDir: string | null;
  backupDir: string | null;
  crashedAttempts: number;
  doneAt: string | null;
  archiveDeletedAt: string | null;
  failedStep: MigrationStep | null;
  failedReason: FailureReason | "verify" | null;
  error: string | null;
}

export interface Login {
  user: string;
  password: string;
}

export interface ClusterOps {
  // null when initdb/pg_ctl are usable, else the problem. Checked before anything changes.
  check(): Promise<string | null>;
  // initdb --encoding=UTF8 --locale=C into a dir that does not exist yet.
  initUtf8(dataDir: string, login: Login): Promise<void>;
  // Starts postgres on dataDir on a free port, returns the port.
  start(dataDir: string): Promise<number>;
  // Clean shutdown: pg_ctl stop -D dataDir -m fast -w. Not embedded-postgres'
  // stop(), which is taskkill /f on Windows.
  stop(dataDir: string): Promise<void>;
}

export interface EncodingChecks {
  // Up to n "Product" rows whose nameDe is not plain ASCII (umlauts, €): id -> nameDe.
  nonAsciiSamples(conn: PgConnection, n: number): Promise<Record<string, string>>;
  // BEGIN; UPDATE "Product" SET "nameOriginal"=$text ... RETURNING; ROLLBACK
  // (temp table when there is no product). Returns what the server gave back.
  roundTrip(conn: PgConnection, text: string): Promise<string>;
}

export interface EncodingMigrationDeps extends BackupDeps {
  // conn (from BackupDeps) = the running OLD cluster, database asia_shop.
  userDataDir: string;
  cluster: ClusterOps;
  checks: EncodingChecks;
  // Login for the new cluster. Default: the old one. #3113 (per-install
  // credential): pass the new credential here, the re-init cluster gets it directly.
  newLogin?: Login;
}

export type EncodingMigrationOutcome =
  // Server is already UTF8 (state file "done" is kept for the archive cleanup).
  | { status: "not-needed"; encoding: string }
  // pgdata is now the verified UTF8 cluster (stopped). Start Postgres again.
  | { status: "migrated"; backupDir: string; archivedDir: string; rowCounts: Record<string, number> }
  // Nothing lost: pgdata is the untouched old cluster (stopped if oldClusterStopped).
  // Show MESSAGE_FAILED, do NOT start Next.
  | {
      status: "failed";
      step: MigrationStep;
      reason: FailureReason | "verify";
      error: string;
      oldClusterStopped: boolean;
      backupDir: string | null;
    };

export type EncodingRecovery =
  // Boot normally (no migration, or a finished one).
  | { status: "none"; prunedArchive: string | null }
  // Crash before verify: pgdata-utf8 removed, old pgdata untouched. Boot, the
  // encoding check finds WIN1252 and migrates again.
  | { status: "rolled-back" }
  // Crash mid-swap: the swap was completed now. Boot normally.
  | { status: "finished-swap"; archivedDir: string }
  // Refuse to start (MESSAGE_FAILED). Nothing was deleted.
  | { status: "failed" | "unclear"; error: string };

// ---- state file ----

function statePath(userDataDir: string): string {
  return path.join(userDataDir, STATE_FILE);
}

export function readMigrationState(userDataDir: string): EncodingMigrationState | null {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(userDataDir), "utf8")) as EncodingMigrationState;
    return s && typeof s.step === "string" ? s : null;
  } catch {
    return null;
  }
}

function writeState(userDataDir: string, state: EncodingMigrationState): EncodingMigrationState {
  const file = statePath(userDataDir);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return state;
}

function patchState(userDataDir: string, state: EncodingMigrationState, patch: Partial<EncodingMigrationState>) {
  return writeState(userDataDir, { ...state, ...patch });
}

function nowOf(deps: Pick<BackupDeps, "now">): Date {
  return (deps.now ?? (() => new Date()))();
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local date, like the backup folder names: pgdata-win1252-20261031
export function archiveDirName(d: Date): string {
  return `${ARCHIVE_PREFIX}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function uniqueDir(base: string): string {
  let dir = base;
  for (let i = 2; fs.existsSync(dir); i++) dir = `${base}-${i}`;
  return dir;
}

function hasCluster(dir: string): boolean {
  return fs.existsSync(path.join(dir, "PG_VERSION"));
}

export function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirBytes(p);
    else if (ent.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

function sameRecord(a: Record<string, number | string>, b: Record<string, number | string>): string | null {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const diff = keys.filter((k) => a[k] !== b[k]).map((k) => `${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  return diff.length ? diff.join(", ") : null;
}

class VerifyError extends Error {}

// ---- boot step 1: before Postgres starts ----

// Call at boot BEFORE startEmbeddedPostgres(). Only files, no Postgres.
export function recoverEncodingMigration(
  deps: Pick<EncodingMigrationDeps, "userDataDir" | "backupsRoot" | "appVersion" | "log" | "now">,
): EncodingRecovery {
  const state = readMigrationState(deps.userDataDir);
  if (!state) return { status: "none", prunedArchive: null };

  switch (state.step) {
    case "done":
      return { status: "none", prunedArchive: pruneArchivedCluster(deps, state) };

    case "rolled-back":
      return { status: "none", prunedArchive: null };

    case "failed":
      // A failed run changed nothing. Disk full / missing tool may be fixed by a
      // restart; anything else would fail the same way until a new release.
      if (state.appVersion === deps.appVersion && state.failedReason !== "diskFull" && state.failedReason !== "toolMissing") {
        return { status: "failed", error: `${state.failedStep}: ${state.error}` };
      }
      fs.rmSync(statePath(deps.userDataDir), { force: true });
      return { status: "none", prunedArchive: null };

    case "verified":
      return finishSwap(deps, state);

    default: {
      // backup / stop-old / init-new / restore / verify: crashed before the new
      // cluster was verified. The old pgdata was never written to.
      if (!hasCluster(state.oldDir)) {
        return { status: "unclear", error: `crashed in step ${state.step} and ${state.oldDir} has no cluster` };
      }
      fs.rmSync(state.newDir, { recursive: true, force: true });
      const crashed = state.crashedAttempts + 1;
      patchState(deps.userDataDir, state, { step: "rolled-back", crashedAttempts: crashed, failedStep: state.step });
      deps.log.warn(`[encoding] run crashed in step ${state.step} (${crashed}x), ${state.newDir} removed, old cluster untouched`);
      return { status: "rolled-back" };
    }
  }
}

function finishSwap(
  deps: Pick<EncodingMigrationDeps, "userDataDir" | "log" | "now">,
  state: EncodingMigrationState,
): EncodingRecovery {
  const { oldDir, newDir, archivedDir } = state;
  if (!archivedDir) return { status: "unclear", error: "state verified without archivedDir" };
  const oldThere = hasCluster(oldDir);
  const newThere = hasCluster(newDir);
  const archThere = hasCluster(archivedDir);
  try {
    if (oldThere && newThere && !archThere) {
      fs.renameSync(oldDir, archivedDir);
      fs.renameSync(newDir, oldDir);
    } else if (!oldThere && newThere && archThere) {
      fs.renameSync(newDir, oldDir);
    } else if (oldThere && !newThere && archThere) {
      // Both renames happened, only the state write was lost.
    } else {
      return {
        status: "unclear",
        error: `swap state unclear: pgdata=${oldThere} pgdata-utf8=${newThere} archive=${archThere}`,
      };
    }
  } catch (err) {
    return { status: "unclear", error: `finishing the swap failed: ${msg(err)}` };
  }
  patchState(deps.userDataDir, state, { step: "done", doneAt: nowOf(deps).toISOString() });
  deps.log.info(`[encoding] swap finished after a crash, old cluster kept as ${archivedDir}`);
  return { status: "finished-swap", archivedDir };
}

// Design 5.1.12. Returns the deleted dir, or null.
export function pruneArchivedCluster(
  deps: Pick<EncodingMigrationDeps, "userDataDir" | "backupsRoot" | "log" | "now">,
  state: EncodingMigrationState,
): string | null {
  if (state.step !== "done" || !state.archivedDir || !state.doneAt || state.archiveDeletedAt) return null;
  if (!fs.existsSync(state.archivedDir)) return null;
  const doneAt = new Date(state.doneAt).getTime();
  if (nowOf(deps).getTime() - doneAt < ARCHIVE_KEEP_MS) return null;
  const utf8Dailies = listBackups(deps.backupsRoot, ["daily"]).filter((b) => {
    const m = b.manifest;
    return (
      m &&
      m.verified.pgRestoreList &&
      m.verified.pgRestoreFullRead &&
      m.verified.zipTest &&
      m.serverEncoding === "UTF8" &&
      new Date(m.createdAt).getTime() > doneAt
    );
  });
  if (utf8Dailies.length < ARCHIVE_MIN_DAILIES) return null;
  fs.rmSync(state.archivedDir, { recursive: true, force: true });
  patchState(deps.userDataDir, state, { archiveDeletedAt: nowOf(deps).toISOString() });
  deps.log.info(`[encoding] deleted ${state.archivedDir} (${utf8Dailies.length} UTF8 dailies since the migration)`);
  return state.archivedDir;
}

// ---- boot step 2: old cluster running, server_encoding != UTF8 ----

// Call after startEmbeddedPostgres() when SHOW server_encoding is not UTF8,
// BEFORE migrateWithBackup / seed / Next / sync poll (nothing else may write).
// deps.conn = the running old cluster. On "migrated" the old cluster has been
// stopped and pgdata holds the new one: start Postgres again.
export async function migrateClusterToUtf8(deps: EncodingMigrationDeps): Promise<EncodingMigrationOutcome> {
  const oldDir = path.join(deps.userDataDir, "pgdata");
  const newDir = path.join(deps.userDataDir, NEW_DIR_NAME);
  const login: Login = deps.newLogin ?? { user: deps.conn.user, password: deps.conn.password };
  const prev = readMigrationState(deps.userDataDir);

  let oldStopped = false;
  let newStarted = false;
  let rowCounts: Record<string, number> = {};
  let step: MigrationStep = "backup";
  let state: EncodingMigrationState = {
    step,
    appVersion: deps.appVersion,
    startedAt: nowOf(deps).toISOString(),
    oldDir,
    newDir,
    archivedDir: null,
    backupDir: null,
    crashedAttempts: prev?.crashedAttempts ?? 0,
    doneAt: null,
    archiveDeletedAt: null,
    failedStep: null,
    failedReason: null,
    error: null,
  };

  const fail = (reason: FailureReason | "verify", error: string): EncodingMigrationOutcome => {
    deps.log.error(`[encoding] migration failed in step ${step} (${reason}): ${error}`);
    try {
      writeState(deps.userDataDir, { ...state, step: "failed", failedStep: step, failedReason: reason, error });
    } catch (err) {
      deps.log.error("[encoding] could not write the state file", err);
    }
    return { status: "failed", step, reason, error, oldClusterStopped: oldStopped, backupDir: state.backupDir };
  };

  if (prev && prev.step !== "rolled-back") {
    // Not overwritten: it may be the only record of a half-done swap.
    const error = `unexpected state file (step ${prev.step}); recoverEncodingMigration() must run before Postgres starts`;
    deps.log.error(`[encoding] ${error}`);
    return { status: "failed", step: prev.step, reason: "unknown", error, oldClusterStopped: false, backupDir: prev.backupDir };
  }
  if (state.crashedAttempts >= MAX_CRASHED_ATTEMPTS) {
    return fail("unknown", `crashed ${state.crashedAttempts} times before verify, not trying again`);
  }

  try {
    // 5.1.1 Still WIN1252?
    const before = await deps.db.serverInfo(deps.conn);
    if (before.serverEncoding === "UTF8") return { status: "not-needed", encoding: before.serverEncoding };
    deps.log.info(`[encoding] server_encoding ${before.serverEncoding}, migrating ${oldDir} to UTF8`);

    const toolProblem = await deps.cluster.check();
    if (toolProblem) return fail("toolMissing", toolProblem);
    if (!hasCluster(oldDir)) return fail("unknown", `${oldDir} has no PG_VERSION`);
    fs.rmSync(newDir, { recursive: true, force: true });
    state = writeState(deps.userDataDir, state);

    // 5.1.2-3 Verified backup (counts + migrations from the dump's snapshot).
    // Never migrate without it.
    const backup = await createBackup(deps, "encoding-migration");
    if (!backup.ok) return fail(backup.reason, `encoding-migration backup failed: ${backup.error}`);
    const manifest: Manifest = backup.backup.manifest;
    state = patchState(deps.userDataDir, state, { backupDir: backup.backup.dir });
    const samples = await deps.checks.nonAsciiSamples(deps.conn, SAMPLE_COUNT);

    // The new cluster needs about as much room as the old one.
    const free = await (deps.freeBytes ?? defaultFreeBytes)(deps.userDataDir);
    const need = dirBytes(oldDir) + FREE_SPACE_MARGIN;
    if (free < need) return fail("diskFull", `free ${free} bytes < ${need} needed for ${NEW_DIR_NAME}`);

    // 5.1.4 Clean stop of the old cluster.
    step = "stop-old";
    state = patchState(deps.userDataDir, state, { step });
    await deps.cluster.stop(oldDir);
    oldStopped = true;

    // 5.1.5-6 New UTF8 cluster, db with ENCODING UTF8 TEMPLATE template0, C locale.
    step = "init-new";
    state = patchState(deps.userDataDir, state, { step });
    await deps.cluster.initUtf8(newDir, login);
    const port = await deps.cluster.start(newDir);
    newStarted = true;
    const newConn: PgConnection = { ...deps.conn, host: "127.0.0.1", port, user: login.user, password: login.password };
    await deps.db.recreateDatabase(newConn);

    // 5.1.7 The archive says WIN1252; pg_restore sets that client_encoding and the UTF8 server converts.
    step = "restore";
    state = patchState(deps.userDataDir, state, { step });
    await deps.tools.restore(newConn, path.join(backup.backup.dir, "db.dump"));

    // 5.1.8 Verify.
    step = "verify";
    state = patchState(deps.userDataDir, state, { step });
    rowCounts = await verifyNewCluster(deps, newConn, manifest, samples);

    // 5.1.9
    await deps.cluster.stop(newDir);
    newStarted = false;

    // 5.1.10 Swap. A crash from here on is finished by recoverEncodingMigration().
    const archivedDir = uniqueDir(path.join(deps.userDataDir, archiveDirName(nowOf(deps))));
    step = "verified";
    state = patchState(deps.userDataDir, state, { step, archivedDir });
  } catch (err) {
    if (newStarted) await deps.cluster.stop(newDir).catch((e) => deps.log.error("[encoding] stopping new cluster failed", e));
    try {
      fs.rmSync(newDir, { recursive: true, force: true });
    } catch (rmErr) {
      deps.log.error(`[encoding] could not remove ${newDir}`, rmErr);
    }
    if (err instanceof VerifyError) return fail("verify", err.message);
    if (err instanceof BackupError) return fail(err.reason, msg(err));
    return fail((err as NodeJS.ErrnoException)?.code === "ENOSPC" ? "diskFull" : "unknown", msg(err));
  }

  // Outside the try: a failed rename must NOT delete pgdata-utf8 (it is the
  // verified cluster). State stays "verified"; the next boot finishes the swap.
  const archivedDir = state.archivedDir as string;
  try {
    fs.renameSync(oldDir, archivedDir);
    fs.renameSync(newDir, oldDir);
  } catch (err) {
    deps.log.error("[encoding] swap failed, will be finished on the next boot", err);
    return {
      status: "failed",
      step: "verified",
      reason: "unknown",
      error: `swap: ${msg(err)}`,
      oldClusterStopped: true,
      backupDir: state.backupDir,
    };
  }
  state = patchState(deps.userDataDir, state, { step: "done", doneAt: nowOf(deps).toISOString() });
  deps.log.info(`[encoding] done, old cluster kept as ${archivedDir}`);
  return { status: "migrated", backupDir: state.backupDir as string, archivedDir, rowCounts };
}

// Design 5.1.8. Throws VerifyError; returns the row counts of the new cluster.
async function verifyNewCluster(
  deps: EncodingMigrationDeps,
  conn: PgConnection,
  manifest: Manifest,
  samples: Record<string, string>,
): Promise<Record<string, number>> {
  const info = await deps.db.serverInfo(conn);
  if (info.serverEncoding !== "UTF8") throw new VerifyError(`server_encoding is ${info.serverEncoding}, not UTF8`);
  if (info.datcollate !== "C") throw new VerifyError(`datcollate is ${info.datcollate}, not C`);

  const counts = await deps.db.rowCounts(conn);
  const countDiff = sameRecord(manifest.rowCounts, counts);
  if (countDiff) throw new VerifyError(`row counts differ: ${countDiff}`);

  const migrations = (await deps.db.appliedMigrations(conn)) ?? [];
  if (JSON.stringify(migrations) !== JSON.stringify(manifest.migrations)) {
    throw new VerifyError(`_prisma_migrations differ: ${manifest.migrations.join(",")} -> ${migrations.join(",")}`);
  }

  if (Object.keys(samples).length) {
    const after = await deps.checks.nonAsciiSamples(conn, SAMPLE_COUNT);
    const subset: Record<string, string> = {};
    for (const id of Object.keys(samples)) subset[id] = after[id];
    const sampleDiff = sameRecord(samples, subset);
    if (sampleDiff) throw new VerifyError(`umlaut/€ values changed: ${sampleDiff}`);
  }

  const back = await deps.checks.roundTrip(conn, ROUND_TRIP_TEXT);
  if (back !== ROUND_TRIP_TEXT) throw new VerifyError(`round trip returned ${JSON.stringify(back)}`);
  return counts;
}
