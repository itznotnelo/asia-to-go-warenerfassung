import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupRunner, createBackup, isDailyDue } from "../../src/backup/engine";
import { selectForPrune, backupFolderName } from "../../src/backup/retention";
import { listBackups, readStatus, removeInterruptedRuns } from "../../src/backup/store";
import { parseTableDataEntries } from "../../src/backup/pg-tools";
import { connFromDatabaseUrl } from "../../src/backup";
import { restoreBackup } from "../../src/backup/restore";
import { BackupError } from "../../src/backup/types";
import { Harness, enospc, fabricateBackup, listDir, makeHarness, writeImages } from "./fakes";

const MB = 1024 * 1024;
const harnesses: Harness[] = [];
function harness(): Harness {
  const h = makeHarness();
  harnesses.push(h);
  return h;
}
afterEach(() => {
  for (const h of harnesses.splice(0)) fs.rmSync(h.userData, { recursive: true, force: true });
});

describe("selectForPrune (design 2.3)", () => {
  it("keeps the newest N by name", () => {
    const names = Array.from({ length: 16 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}_021500_v0.2.0`);
    const doomed = selectForPrune(names, 14);
    expect(doomed).toEqual(["2026-10-02_021500_v0.2.0", "2026-10-01_021500_v0.2.0"]);
  });

  it("never drops below one backup and ignores .tmp-*", () => {
    expect(selectForPrune(["a", "b"], 0)).toEqual(["a"]);
    expect(selectForPrune([".tmp-z", "a"], 1)).toEqual([]);
  });

  it("never prunes encoding-migration (keep Infinity)", () => {
    expect(selectForPrune(["a", "b", "c"], Infinity)).toEqual([]);
  });

  it("folder names sort by time", () => {
    const a = backupFolderName(new Date(2026, 9, 30, 2, 15, 0), "0.2.0");
    const b = backupFolderName(new Date(2026, 9, 30, 14, 3, 9), "0.2.0");
    expect(a).toBe("2026-10-30_021500_v0.2.0");
    expect(a < b).toBe(true);
  });
});

describe("createBackup", () => {
  it("writes db.dump, images.zip and a manifest with sha256 and row counts", async () => {
    const h = harness();
    writeImages(h.deps.imagesDir, { "p1/a.jpg": "aaa", "p1/b.jpg": "bbb", "p2/c.webp": "ccc" });
    const r = await createBackup(h.deps, "daily");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.name).toBe("2026-10-30_021500_v0.2.0");
    expect(listDir(r.backup.dir)).toEqual(["db.dump", "images.zip", "manifest.json"]);
    const m = r.backup.manifest;
    expect(m.rowCounts).toEqual({ Product: 412, ProductImage: 530, Category: 31, _prisma_migrations: 3 });
    expect(m.imageCount).toBe(3);
    expect(m.files["db.dump"].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.lastMigration).toBe("20261006001500_add_shop_sync");
    expect(m.verified).toEqual({ pgRestoreList: true, pgRestoreFullRead: true, zipTest: true });
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toEqual(["2026-10-30_021500_v0.2.0"]);
    expect(readStatus(h.deps.backupsRoot).lastOkAt).toBe(new Date(2026, 9, 30, 2, 15, 0).toISOString());
  });

  it("runs pg_dump, then pg_restore --list, then the full read", async () => {
    const h = harness();
    await createBackup(h.deps, "manual");
    expect(h.ctl.events).toEqual(["dump", "list", "fullRead"]);
  });

  it("two backups in the same second get distinct folders", async () => {
    const h = harness();
    await createBackup(h.deps, "manual");
    const r = await createBackup(h.deps, "manual");
    expect(r.ok && r.backup.name).toBe("2026-10-30_021500_v0.2.0-2");
  });

  it("a truncated dump that still lists fine is caught by the full read (design T6)", async () => {
    const h = harness();
    h.ctl.truncateDump = true;
    const r = await createBackup(h.deps, "daily");
    expect(r).toMatchObject({ ok: false, reason: "corrupt" });
    expect(h.ctl.events).toEqual(["dump", "list", "fullRead"]);
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toEqual([]);
    expect(readStatus(h.deps.backupsRoot)).toMatchObject({ lastError: "corrupt", consecutiveFailures: 1 });
  });

  it("a missing pg_dump is reported as toolMissing", async () => {
    const h = harness();
    h.deps.tools.dump = async () => {
      throw new BackupError("toolMissing", "pg_dump.exe not runnable: ENOENT");
    };
    const r = await createBackup(h.deps, "daily");
    expect(r).toMatchObject({ ok: false, reason: "toolMissing" });
  });
});

describe("row counts from the dump's snapshot (#3111)", () => {
  it("writes between the count and pg_dump: manifest matches the dump and the backup restores", async () => {
    const h = harness();
    writeImages(h.deps.imagesDir, { "p1/a.jpg": "aaa" });
    // The app / sync poll add rows after the counts were read, before pg_dump starts.
    h.ctl.beforeDump = () => {
      h.ctl.beforeDump = undefined;
      h.db.tables.Product += 5;
      h.db.tables.ProductImage += 2;
    };
    const r = await createBackup(h.deps, "daily");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.manifest.rowCounts).toMatchObject({ Product: 412, ProductImage: 530 });
    expect(h.ctl.dumpSnapshots).toEqual(["00000003-0000001B-1"]);
    expect(h.ctl.snapshots).toEqual({}); // transaction ended after the dump
    expect(h.db.tables.Product).toBe(417);

    h.setNow(new Date(2026, 9, 30, 14, 0, 0));
    const restored = await restoreBackup(h.deps, r.backup.dir, { stopApp: async () => undefined });
    expect(restored).toMatchObject({ ok: true });
    expect(h.db.tables).toMatchObject({ Product: 412, ProductImage: 530 });
  });

  it("migrations in the manifest come from the same snapshot", async () => {
    const h = harness();
    h.ctl.beforeDump = () => {
      h.db.migrations = [...(h.db.migrations ?? []), "20261030000000_later"];
    };
    const r = await createBackup(h.deps, "manual");
    expect(r.ok && r.backup.manifest.lastMigration).toBe("20261006001500_add_shop_sync");
  });

  it("the snapshot is released when pg_dump fails", async () => {
    const h = harness();
    h.ctl.dumpError = enospc();
    const r = await createBackup(h.deps, "daily");
    expect(r).toMatchObject({ ok: false, reason: "diskFull" });
    expect(h.ctl.snapshotsOpened).toBe(1);
    expect(h.ctl.snapshots).toEqual({});
  });
});

describe("retention and prune order (design T9)", () => {
  function seed(h: Harness) {
    for (let d = 1; d <= 16; d++) fabricateBackup(h.deps.backupsRoot, "daily", `2026-10-${String(d).padStart(2, "0")}_021500_v0.1.5`);
    fs.mkdirSync(path.join(h.deps.backupsRoot, "daily", ".tmp-x"));
    fabricateBackup(h.deps.backupsRoot, "pre-migrate", "2026-09-01_080000_v0.1.4");
    fabricateBackup(h.deps.backupsRoot, "pre-migrate", "2026-09-20_080000_v0.1.5");
  }

  it("startup removes .tmp-*, a new verified daily prunes to 14, other pools untouched", async () => {
    const h = harness();
    seed(h);
    expect(removeInterruptedRuns(h.deps.backupsRoot)).toEqual(["daily/.tmp-x"]);
    const r = await createBackup(h.deps, "daily");
    expect(r.ok).toBe(true);
    const daily = listDir(path.join(h.deps.backupsRoot, "daily"));
    expect(daily).toHaveLength(14);
    expect(daily[daily.length - 1]).toBe("2026-10-30_021500_v0.2.0");
    expect(daily[0]).toBe("2026-10-04_021500_v0.1.5");
    expect(r.ok && r.pruned.sort()).toEqual([
      "2026-10-01_021500_v0.1.5",
      "2026-10-02_021500_v0.1.5",
      "2026-10-03_021500_v0.1.5",
    ]);
    expect(listDir(path.join(h.deps.backupsRoot, "pre-migrate"))).toHaveLength(2);
  });

  it("a failed daily prunes nothing: still 16 daily", async () => {
    const h = harness();
    seed(h);
    removeInterruptedRuns(h.deps.backupsRoot);
    h.ctl.truncateDump = true;
    const r = await createBackup(h.deps, "daily");
    expect(r.ok).toBe(false);
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toHaveLength(16);
    expect(listDir(path.join(h.deps.backupsRoot, "pre-migrate"))).toHaveLength(2);
  });

  it("pruning happens only after the new folder is renamed into place", async () => {
    const h = harness();
    seed(h);
    removeInterruptedRuns(h.deps.backupsRoot);
    const rm = vi.spyOn(fs, "rmSync");
    const rename = vi.spyOn(fs, "renameSync");
    await createBackup(h.deps, "daily");
    const firstPrune = rm.mock.invocationCallOrder[0];
    const finalRename = rename.mock.invocationCallOrder.find((_, i) =>
      String(rename.mock.calls[i][1]).endsWith(path.join("daily", "2026-10-30_021500_v0.2.0")),
    );
    expect(finalRename).toBeDefined();
    expect(firstPrune).toBeGreaterThan(finalRename as number);
    rm.mockRestore();
    rename.mockRestore();
  });
});

describe("free space / full disk (design 2.4, T7)", () => {
  it("skips when free < 2 x last backup + 500 MB, and prunes nothing", async () => {
    const h = harness();
    for (let d = 1; d <= 15; d++) fabricateBackup(h.deps.backupsRoot, "daily", `2026-10-${String(d).padStart(2, "0")}_021500_v0.1.5`, 200 * MB);
    h.setFree(100 * MB);
    const r = await createBackup(h.deps, "daily");
    expect(r).toMatchObject({ ok: false, reason: "diskFull" });
    expect(h.ctl.events).toEqual([]); // pg_dump never started
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toHaveLength(15);
    expect(readStatus(h.deps.backupsRoot).lastError).toBe("diskFull");
  });

  it("first run needs 1 GB free", async () => {
    const h = harness();
    h.setFree(900 * MB);
    expect(await createBackup(h.deps, "manual")).toMatchObject({ ok: false, reason: "diskFull" });
    h.setFree(1100 * MB);
    expect((await createBackup(h.deps, "manual")).ok).toBe(true);
  });

  it("ENOSPC during pg_dump removes the .tmp folder and keeps older backups", async () => {
    const h = harness();
    fabricateBackup(h.deps.backupsRoot, "daily", "2026-10-29_021500_v0.2.0");
    h.ctl.dumpError = enospc();
    const r = await createBackup(h.deps, "daily");
    expect(r).toMatchObject({ ok: false, reason: "diskFull" });
    expect(listDir(path.join(h.deps.backupsRoot, "daily"))).toEqual(["2026-10-29_021500_v0.2.0"]);
  });
});

describe("daily schedule + single flight", () => {
  it("daily is due when the newest daily is 20 h old", async () => {
    const h = harness();
    expect(isDailyDue(h.deps)).toBe(true);
    await createBackup(h.deps, "daily");
    h.setNow(new Date(2026, 9, 30, 21, 0, 0));
    expect(isDailyDue(h.deps)).toBe(false);
    h.setNow(new Date(2026, 9, 30, 22, 15, 0));
    expect(isDailyDue(h.deps)).toBe(true);
  });

  it("a manual click while the daily runs joins it", async () => {
    const h = harness();
    const runner = new BackupRunner(h.deps);
    const a = runner.run("daily");
    const b = runner.run("manual");
    expect(b).toBe(a);
    await a;
    expect(listBackups(h.deps.backupsRoot)).toHaveLength(1);
    expect(runner.busy).toBe(false);
  });
});

describe("helpers", () => {
  it("parses TABLE DATA entries from pg_restore --list", () => {
    const out = [
      ";     Dumped from database version 18.4",
      "215; 1259 16390 TABLE public Product asia_shop",
      "3420; 0 16390 TABLE DATA public Product asia_shop",
      "3421; 0 16402 TABLE DATA public _prisma_migrations asia_shop",
      "3422; 0 16410 TABLE DATA public \"SyncOutbox\" asia_shop",
    ].join("\r\n");
    expect(parseTableDataEntries(out)).toEqual(["Product", "_prisma_migrations", "SyncOutbox"]);
  });

  it("parses the app's databaseUrl", () => {
    expect(connFromDatabaseUrl("postgresql://asia_shop:asia_shop@127.0.0.1:61234/asia_shop?schema=public")).toEqual({
      host: "127.0.0.1",
      port: 61234,
      user: "asia_shop",
      password: "asia_shop",
      database: "asia_shop",
    });
  });
});
