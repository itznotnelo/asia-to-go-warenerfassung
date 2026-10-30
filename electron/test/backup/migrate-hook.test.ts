import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markWaitingForFix, migrateWithBackup, pendingMigrations } from "../../src/backup/migrate-hook";
import { readStatus } from "../../src/backup/store";
import { BackupError } from "../../src/backup/types";
import { Harness, fabricateBackup, listDir, makeHarness } from "./fakes";

const MB = 1024 * 1024;
const harnesses: Harness[] = [];
function setup(appVersion = "0.2.0") {
  const h = makeHarness(appVersion);
  harnesses.push(h);
  const migrationsDir = path.join(h.userData, "prisma", "migrations");
  for (const m of ["20260901000000_init", "20261006001500_add_shop_sync", "20261101000000_new_column"]) {
    fs.mkdirSync(path.join(migrationsDir, m), { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, m, "migration.sql"), "-- sql");
  }
  fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), "provider = \"postgresql\"");
  return { h, migrationsDir };
}
afterEach(() => {
  for (const h of harnesses.splice(0)) fs.rmSync(h.userData, { recursive: true, force: true });
});

describe("pendingMigrations", () => {
  it("is shipped minus applied; everything when the table is missing", () => {
    expect(pendingMigrations(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
    expect(pendingMigrations(["a"], null)).toEqual(["a"]);
  });
});

describe("migrateWithBackup (design 3.3)", () => {
  it("pending migration: verified pre-migrate backup first, then migrate", async () => {
    const { h, migrationsDir } = setup();
    const runMigrations = vi.fn(async () => {
      h.ctl.events.push("migrate");
    });
    const out = await migrateWithBackup(h.deps, { migrationsDir, runMigrations });
    expect(out.status).toBe("migrated");
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(h.ctl.events).toEqual(["dump", "list", "fullRead", "migrate"]);
    expect(listDir(path.join(h.deps.backupsRoot, "pre-migrate"))).toHaveLength(1);
  });

  it("full disk: backup fails, runMigrations is NOT called", async () => {
    const { h, migrationsDir } = setup();
    fabricateBackup(h.deps.backupsRoot, "daily", "2026-10-29_021500_v0.1.5", 200 * MB);
    h.setFree(100 * MB);
    const runMigrations = vi.fn(async () => undefined);
    const out = await migrateWithBackup(h.deps, { migrationsDir, runMigrations });
    expect(out).toMatchObject({ status: "blocked", reason: "diskFull", pending: ["20261101000000_new_column"] });
    expect(runMigrations).not.toHaveBeenCalled();
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toEqual(["2026-10-29_021500_v0.1.5"]);
  });

  it("no pg_dump: runMigrations is NOT called", async () => {
    const { h, migrationsDir } = setup();
    h.deps.tools.dump = async () => {
      throw new BackupError("toolMissing", "pg_dump.exe not runnable: ENOENT");
    };
    const runMigrations = vi.fn(async () => undefined);
    const out = await migrateWithBackup(h.deps, { migrationsDir, runMigrations });
    expect(out).toMatchObject({ status: "blocked", reason: "toolMissing" });
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("corrupt dump: runMigrations is NOT called", async () => {
    const { h, migrationsDir } = setup();
    h.ctl.truncateDump = true;
    const runMigrations = vi.fn(async () => undefined);
    const out = await migrateWithBackup(h.deps, { migrationsDir, runMigrations });
    expect(out).toMatchObject({ status: "blocked", reason: "corrupt" });
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("fresh database: migrates without a backup", async () => {
    const { h, migrationsDir } = setup();
    h.db.migrations = null;
    const runMigrations = vi.fn(async () => undefined);
    expect(await migrateWithBackup(h.deps, { migrationsDir, runMigrations })).toEqual({ status: "fresh" });
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(h.ctl.events).toEqual([]);
  });

  it("nothing pending: no backup", async () => {
    const { h, migrationsDir } = setup();
    h.db.migrations = ["20260901000000_init", "20261006001500_add_shop_sync", "20261101000000_new_column"];
    const runMigrations = vi.fn(async () => undefined);
    expect(await migrateWithBackup(h.deps, { migrationsDir, runMigrations })).toEqual({ status: "up-to-date" });
    expect(h.ctl.events).toEqual([]);
  });

  it("failed migrate: offers the pre-migrate backup, never retries on the same version", async () => {
    const { h, migrationsDir } = setup();
    const failing = vi.fn(async () => {
      throw new Error("P3018 migration failed");
    });
    const first = await migrateWithBackup(h.deps, { migrationsDir, runMigrations: failing });
    expect(first.status).toBe("migrate-failed");
    const backupDir = first.status === "migrate-failed" ? first.backupDir : "";
    expect(fs.existsSync(path.join(backupDir, "manifest.json"))).toBe(true);

    // Next boot, same version: same offer, no second backup, no second migrate.
    h.ctl.events.length = 0;
    const second = await migrateWithBackup(h.deps, { migrationsDir, runMigrations: failing });
    expect(second).toMatchObject({ status: "migrate-failed", backupDir });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(h.ctl.events).toEqual([]);
    expect(listDir(path.join(h.deps.backupsRoot, "pre-migrate"))).toHaveLength(1);

    // After the restore: waiting for a fixed release.
    markWaitingForFix(h.deps);
    expect(await migrateWithBackup(h.deps, { migrationsDir, runMigrations: failing })).toEqual({
      status: "waiting-for-fix",
      appVersion: "0.2.0",
    });
    expect(failing).toHaveBeenCalledTimes(1);

    // A new release clears the state and tries again (with a new backup).
    const fixed = { ...h.deps, appVersion: "0.2.1" };
    const ok = vi.fn(async () => undefined);
    expect((await migrateWithBackup(fixed, { migrationsDir, runMigrations: ok })).status).toBe("migrated");
    expect(ok).toHaveBeenCalledTimes(1);
    expect(readStatus(h.deps.backupsRoot)).toMatchObject({ failedMigration: null, failedMigrationAppVersion: null });
  });
});
