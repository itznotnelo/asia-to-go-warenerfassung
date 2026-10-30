import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackup } from "../../src/backup/engine";
import { pruneImageSnapshots, restoreBackup } from "../../src/backup/restore";
import { copyBackupToTarget, syncNewestToTarget } from "../../src/backup/second-copy";
import { listFilesRecursive } from "../../src/backup/zip";
import { Harness, listDir, makeHarness, writeImages } from "./fakes";

const harnesses: Harness[] = [];
function harness(): Harness {
  const h = makeHarness();
  harnesses.push(h);
  return h;
}
afterEach(() => {
  for (const h of harnesses.splice(0)) fs.rmSync(h.userData, { recursive: true, force: true });
});

async function backupWithImages(h: Harness) {
  writeImages(h.deps.imagesDir, { "p1/a.jpg": "aaa", "p1/b.jpg": "bbb", "p2/c.webp": "ccc" });
  const r = await createBackup(h.deps, "daily");
  if (!r.ok) throw new Error(r.error);
  return r.backup;
}

describe("restoreBackup (design 4, T8)", () => {
  it("restores DB and images, keeps the previous images, stops the app before the drop", async () => {
    const h = harness();
    const backup = await backupWithImages(h);

    // Later changes that the restore must undo.
    h.db.tables.Product = 420;
    fs.rmSync(path.join(h.deps.imagesDir, "p1", "b.jpg"));
    writeImages(h.deps.imagesDir, { "p3/new.jpg": "new" });
    h.setNow(new Date(2026, 9, 30, 14, 0, 0));

    const stopApp = vi.fn(async () => {
      h.ctl.events.push("stopApp");
    });
    const runMigrations = vi.fn(async () => {
      h.ctl.events.push("migrate");
    });
    h.ctl.events.length = 0;
    const r = await restoreBackup(h.deps, backup.dir, { stopApp, runMigrations });

    expect(r.ok).toBe(true);
    expect(h.db.tables.Product).toBe(412);
    expect(listFilesRecursive(h.deps.imagesDir)).toEqual(["p1/a.jpg", "p1/b.jpg", "p2/c.webp"]);
    const prev = r.ok ? r.previousImagesDir : null;
    expect(prev && listFilesRecursive(prev)).toEqual(["p1/a.jpg", "p3/new.jpg"]);
    expect(h.ctl.events.indexOf("stopApp")).toBeLessThan(h.ctl.events.indexOf("recreateDatabase"));
    expect(h.ctl.events[h.ctl.events.length - 1]).toBe("migrate");
    // Safety copy of the 14:00 state exists in pre-restore.
    expect(r.ok && r.safetyBackup?.manifest.rowCounts.Product).toBe(420);
    expect(listDir(path.join(h.deps.backupsRoot, "pre-restore"))).toHaveLength(1);
  });

  it("refuses a backup whose dump no longer matches the manifest; app not stopped", async () => {
    const h = harness();
    const backup = await backupWithImages(h);
    fs.appendFileSync(path.join(backup.dir, "db.dump"), "bitrot");
    const stopApp = vi.fn(async () => undefined);
    const r = await restoreBackup(h.deps, backup.dir, { stopApp });
    expect(r).toMatchObject({ ok: false, step: "verify", changed: false, appStopped: false });
    expect(stopApp).not.toHaveBeenCalled();
    expect(h.ctl.events).not.toContain("recreateDatabase");
  });

  it("failed pg_restore puts the pre-restore state back", async () => {
    const h = harness();
    const backup = await backupWithImages(h);
    h.db.tables.Product = 420;
    h.setNow(new Date(2026, 9, 30, 14, 0, 0));
    h.ctl.restoreError = new Error("pg_restore: error: could not execute query");
    h.ctl.restoreErrorOnce = true;
    const r = await restoreBackup(h.deps, backup.dir, { stopApp: async () => undefined });
    expect(r).toMatchObject({ ok: false, step: "db", changed: true, rolledBack: true });
    expect(h.db.tables.Product).toBe(420);
    expect(listFilesRecursive(h.deps.imagesDir)).toEqual(["p1/a.jpg", "p1/b.jpg", "p2/c.webp"]);
    expect(fs.existsSync(path.join(h.userData, "images.restore-tmp"))).toBe(false);
  });

  it("rollback failure is reported as not rolled back", async () => {
    const h = harness();
    const backup = await backupWithImages(h);
    h.setNow(new Date(2026, 9, 30, 14, 0, 0));
    h.ctl.restoreError = new Error("pg_restore: error: boom");
    const r = await restoreBackup(h.deps, backup.dir, { stopApp: async () => undefined });
    expect(r).toMatchObject({ ok: false, step: "db", rolledBack: false });
  });

  it("an unreadable current DB skips the safety copy and still restores", async () => {
    const h = harness();
    const backup = await backupWithImages(h);
    h.db.readable = false;
    h.setNow(new Date(2026, 9, 30, 14, 0, 0));
    const r = await restoreBackup(h.deps, backup.dir, { stopApp: async () => undefined });
    expect(r).toMatchObject({ ok: true, safetyBackup: null });
    expect(h.db.tables.Product).toBe(412);
  });

  it("image snapshots older than 7 days are removed", () => {
    const h = harness();
    const old = path.join(h.userData, "images.before-restore-2026-10-20_100000_v0.2.0");
    const recent = path.join(h.userData, "images.before-restore-2026-10-28_100000_v0.2.0");
    fs.mkdirSync(old);
    fs.mkdirSync(recent);
    expect(pruneImageSnapshots(h.deps.imagesDir, new Date(2026, 9, 30, 12, 0, 0))).toEqual([path.basename(old)]);
    expect(fs.existsSync(recent)).toBe(true);
  });
});

describe("second copy (design 2.5)", () => {
  it("copies a verified backup into AsiaToGo-Backups and checks sha256", async () => {
    const h = harness();
    const backup = await backupWithImages(h);
    const usb = path.join(h.userData, "usb");
    fs.mkdirSync(usb);
    const r = await copyBackupToTarget(h.deps, backup, usb);
    expect(r.ok).toBe(true);
    expect(listDir(path.join(usb, "AsiaToGo-Backups", "daily", backup.name))).toEqual(["db.dump", "images.zip", "manifest.json"]);
  });

  it("missing target is a warning, and the hourly catch-up copies once it is back", async () => {
    const h = harness();
    await backupWithImages(h);
    const usb = path.join(h.userData, "usb");
    expect(await syncNewestToTarget(h.deps, usb)).toMatchObject({ ok: false, missing: true });
    fs.mkdirSync(usb);
    expect((await syncNewestToTarget(h.deps, usb))?.ok).toBe(true);
  });
});
