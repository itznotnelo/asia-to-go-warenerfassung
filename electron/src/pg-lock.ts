import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Postgres lifecycle around the embedded cluster (review should 21): an
// orphaned or stale postmaster.pid before start, and a clean stop instead of
// embedded-postgres' taskkill /f. No electron imports, so vitest can load it.

export interface PgLockLog {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

// First line of postmaster.pid is the postmaster's PID.
export function parsePostmasterPid(text: string): number | null {
  const pid = Number(text.split(/\r?\n/, 1)[0].trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function readPostmasterPid(dataDir: string): number | null {
  try {
    return parsePostmasterPid(fs.readFileSync(path.join(dataDir, "postmaster.pid"), "utf8"));
  } catch {
    return null;
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, we just may not signal it.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Windows reuses PIDs, so a live PID is only ours if it is a postgres binary.
export function isPostgresProcess(pid: number): Promise<boolean> {
  if (process.platform !== "win32") {
    try {
      return Promise.resolve(fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim().startsWith("postgres"));
    } catch {
      return Promise.resolve(false);
    }
  }
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 10_000 },
      (err, stdout) => resolve(!err && /^"postgres\.exe"/im.test(stdout)),
    );
  });
}

export interface StaleLockOps {
  isRunning(pid: number): boolean;
  isPostgres(pid: number): Promise<boolean>;
  // Graceful first (pg_ctl stop -m fast); throws when that did not work.
  stopCluster(dataDir: string): Promise<void>;
  kill(pid: number): void;
  log: PgLockLog;
}

export type StaleLockResult = "none" | "stale-removed" | "orphan-stopped";

/**
 * Before pg.start(): a postmaster.pid whose PID is dead (or now belongs to
 * another program) is removed; a live postgres on our data dir is an orphan
 * of a killed app and is stopped. Only called once this instance holds the
 * single-instance lock, so a live postgres here is never a running app's.
 */
export async function clearStaleLock(dataDir: string, ops: StaleLockOps): Promise<StaleLockResult> {
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (!fs.existsSync(pidFile)) return "none";
  const pid = readPostmasterPid(dataDir);

  if (pid !== null && ops.isRunning(pid) && (await ops.isPostgres(pid))) {
    ops.log.warn(`[postgres] orphaned postmaster ${pid} from an earlier run, stopping it`);
    try {
      await ops.stopCluster(dataDir);
    } catch (err) {
      ops.log.warn("[postgres] pg_ctl stop failed, killing the orphan", err);
      ops.kill(pid);
    }
    // pg_ctl removes the file itself; after a kill it is left behind.
    if (!ops.isRunning(pid)) fs.rmSync(pidFile, { force: true });
    return "orphan-stopped";
  }

  ops.log.info(`[postgres] removing stale postmaster.pid (pid ${pid ?? "unreadable"} is not running)`);
  fs.rmSync(pidFile, { force: true });
  return "stale-removed";
}

/** pg_ctl stop -m fast first; the hard stop only when that fails or hangs. */
export async function stopGracefully(o: {
  pgCtlStop: () => Promise<void>;
  hardStop: () => Promise<void>;
  timeoutMs: number;
  log: PgLockLog;
}): Promise<"graceful" | "hard"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      o.pgCtlStop(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`pg_ctl stop took longer than ${o.timeoutMs} ms`)), o.timeoutMs);
      }),
    ]);
    return "graceful";
  } catch (err) {
    o.log.warn("[postgres] graceful stop failed, falling back to a hard stop", err);
    await o.hardStop();
    return "hard";
  } finally {
    clearTimeout(timer);
  }
}

// embedded-postgres rejects start() with no reason; the last line Postgres
// wrote to stderr usually says why ("lock file ... already exists").
export function postgresStartError(reason: unknown, lastErrorLine: string | null): Error {
  const why =
    reason instanceof Error ? reason.message : reason ? String(reason) : lastErrorLine ?? "no reason given";
  const tail = lastErrorLine && !why.includes(lastErrorLine) ? ` (last Postgres message: ${lastErrorLine})` : "";
  return new Error(`Embedded Postgres did not start: ${why}${tail}`, { cause: reason });
}
