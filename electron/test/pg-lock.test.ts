import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStaleLock, parsePostmasterPid, postgresStartError, stopGracefully, type StaleLockOps } from "../src/pg-lock";

const quietLog = { info: () => {}, warn: () => {} };
let dataDir: string;
const pidFile = () => path.join(dataDir, "postmaster.pid");

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-lock-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.useRealTimers();
});

function ops(over: Partial<StaleLockOps>): StaleLockOps {
  return {
    isRunning: () => false,
    isPostgres: async () => false,
    stopCluster: vi.fn(async () => {}),
    kill: vi.fn(),
    log: quietLog,
    ...over,
  };
}

describe("parsePostmasterPid", () => {
  it("reads the first line, Windows line endings too", () => {
    expect(parsePostmasterPid("4242\r\nC:/pgdata\r\n")).toBe(4242);
    expect(parsePostmasterPid("17\n/data\n")).toBe(17);
    expect(parsePostmasterPid("")).toBeNull();
    expect(parsePostmasterPid("abc\n")).toBeNull();
  });
});

describe("clearStaleLock (should 21)", () => {
  it("does nothing without a postmaster.pid", async () => {
    expect(await clearStaleLock(dataDir, ops({}))).toBe("none");
  });

  it("removes the file when its PID is dead", async () => {
    fs.writeFileSync(pidFile(), "4242\n");
    const o = ops({ isRunning: () => false });
    expect(await clearStaleLock(dataDir, o)).toBe("stale-removed");
    expect(fs.existsSync(pidFile())).toBe(false);
    expect(o.stopCluster).not.toHaveBeenCalled();
  });

  it("removes the file when Windows gave the PID to another program", async () => {
    fs.writeFileSync(pidFile(), "4242\n");
    const o = ops({ isRunning: () => true, isPostgres: async () => false });
    expect(await clearStaleLock(dataDir, o)).toBe("stale-removed");
    expect(fs.existsSync(pidFile())).toBe(false);
    expect(o.kill).not.toHaveBeenCalled();
  });

  it("stops an orphaned postgres with pg_ctl first", async () => {
    fs.writeFileSync(pidFile(), "4242\n");
    let running = true;
    const o = ops({
      isRunning: () => running,
      isPostgres: async () => true,
      stopCluster: vi.fn(async () => {
        running = false;
        fs.rmSync(pidFile());
      }),
    });
    expect(await clearStaleLock(dataDir, o)).toBe("orphan-stopped");
    expect(o.stopCluster).toHaveBeenCalledWith(dataDir);
    expect(o.kill).not.toHaveBeenCalled();
  });

  it("kills the orphan when pg_ctl fails, then removes the leftover file", async () => {
    fs.writeFileSync(pidFile(), "4242\n");
    let running = true;
    const o = ops({
      isRunning: () => running,
      isPostgres: async () => true,
      stopCluster: vi.fn(async () => {
        throw new Error("pg_ctl stop failed");
      }),
      kill: vi.fn(() => {
        running = false;
      }),
    });
    expect(await clearStaleLock(dataDir, o)).toBe("orphan-stopped");
    expect(o.kill).toHaveBeenCalledWith(4242);
    expect(fs.existsSync(pidFile())).toBe(false);
  });

  it("removes an unreadable pid file", async () => {
    fs.writeFileSync(pidFile(), "");
    expect(await clearStaleLock(dataDir, ops({}))).toBe("stale-removed");
    expect(fs.existsSync(pidFile())).toBe(false);
  });
});

describe("stopGracefully (should 21)", () => {
  it("uses pg_ctl and never the hard stop when that works", async () => {
    const hardStop = vi.fn(async () => {});
    const how = await stopGracefully({ pgCtlStop: async () => {}, hardStop, timeoutMs: 1000, log: quietLog });
    expect(how).toBe("graceful");
    expect(hardStop).not.toHaveBeenCalled();
  });

  it("falls back to the hard stop when pg_ctl fails", async () => {
    const hardStop = vi.fn(async () => {});
    const how = await stopGracefully({
      pgCtlStop: async () => {
        throw new Error("toolMissing");
      },
      hardStop,
      timeoutMs: 1000,
      log: quietLog,
    });
    expect(how).toBe("hard");
    expect(hardStop).toHaveBeenCalledTimes(1);
  });

  it("falls back to the hard stop when pg_ctl hangs", async () => {
    vi.useFakeTimers();
    const hardStop = vi.fn(async () => {});
    const done = stopGracefully({ pgCtlStop: () => new Promise(() => {}), hardStop, timeoutMs: 15_000, log: quietLog });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(done).resolves.toBe("hard");
    expect(hardStop).toHaveBeenCalledTimes(1);
  });
});

describe("postgresStartError (should 21)", () => {
  it("turns embedded-postgres' empty rejection into a readable error", () => {
    const err = postgresStartError(undefined, 'FATAL:  lock file "postmaster.pid" already exists');
    expect(err.message).toBe('Embedded Postgres did not start: FATAL:  lock file "postmaster.pid" already exists');
  });

  it("keeps a real reason and adds the last Postgres line", () => {
    const err = postgresStartError(new Error("spawn ENOENT"), "FATAL: x");
    expect(err.message).toBe("Embedded Postgres did not start: spawn ENOENT (last Postgres message: FATAL: x)");
  });

  it("still says something with nothing to go on", () => {
    expect(postgresStartError(undefined, null).message).toBe("Embedded Postgres did not start: no reason given");
  });
});
