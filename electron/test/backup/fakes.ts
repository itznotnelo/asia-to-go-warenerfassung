import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BackupDeps, BackupError, DbOps, Manifest, PgTools, Pool } from "../../src/backup/types";

// In-memory "Postgres" + fake pg_dump/pg_restore for the engine tests.
// Dump format: line 1 = "PGDMP <table,table,...>" (what --list reads, like the
// real TOC at the start of the file), then a JSON body (what a full read
// needs). Truncating the file keeps line 1 intact, so --list still passes
// and only the full read fails: the same behaviour design T6 checks for real.

export interface FakeDb {
  tables: Record<string, number>;
  encoding: string;
  migrations: string[] | null;
  readable: boolean;
}

export interface FakeControls {
  dumpError?: Error;
  truncateDump?: boolean;
  restoreError?: Error;
  restoreErrorOnce?: boolean;
  // Runs at the start of pg_dump: a write by the app or the sync poll that
  // lands after the manifest counts were read (#3111).
  beforeDump?: () => void;
  events: string[];
  // Exported snapshots that are still open, by id (like pg_export_snapshot:
  // usable by pg_dump --snapshot only while the exporting tx is open).
  snapshots: Record<string, { tables: Record<string, number>; migrations: string[] | null }>;
  snapshotsOpened: number;
  // --snapshot value of every pg_dump run (undefined = no snapshot).
  dumpSnapshots: (string | undefined)[];
}

export function makeTempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atg-backup-test-"));
}

export function fakeTools(db: FakeDb, ctl: FakeControls): PgTools {
  return {
    async version() {
      return "pg_dump (PostgreSQL) 18.4";
    },
    async dump(_conn, file, opts) {
      ctl.events.push("dump");
      ctl.dumpSnapshots.push(opts?.snapshot);
      ctl.beforeDump?.();
      if (ctl.dumpError) {
        fs.writeFileSync(file, "PGDMP partial");
        throw ctl.dumpError;
      }
      let state: { tables: Record<string, number>; migrations: string[] | null } = db;
      if (opts?.snapshot) {
        const snap = ctl.snapshots[opts.snapshot];
        if (!snap) throw new Error(`pg_dump: error: invalid snapshot identifier: "${opts.snapshot}"`);
        state = snap;
      }
      const body = JSON.stringify({ tables: state.tables, migrations: state.migrations, pad: "x".repeat(200) });
      let content = `PGDMP ${Object.keys(state.tables).join(",")}\n${body}`;
      if (ctl.truncateDump) content = content.slice(0, Math.floor(content.length * (2 / 3)));
      fs.writeFileSync(file, content);
    },
    async listTableData(file) {
      ctl.events.push("list");
      const first = fs.readFileSync(file, "utf8").split("\n")[0];
      if (!first.startsWith("PGDMP ")) throw new Error("input file does not appear to be a valid archive");
      return first.slice(6).split(",").filter(Boolean);
    },
    async fullRead(file) {
      ctl.events.push("fullRead");
      const body = fs.readFileSync(file, "utf8").split("\n").slice(1).join("\n");
      try {
        JSON.parse(body);
      } catch {
        throw new Error("pg_restore: error: could not read input file: end of file");
      }
    },
    async restore(_conn, file) {
      ctl.events.push("restore");
      if (ctl.restoreError) {
        const e = ctl.restoreError;
        if (ctl.restoreErrorOnce) ctl.restoreError = undefined;
        throw e;
      }
      const body = JSON.parse(fs.readFileSync(file, "utf8").split("\n").slice(1).join("\n"));
      db.tables = { ...body.tables };
      db.migrations = body.migrations;
    },
  };
}

export function fakeDbOps(db: FakeDb, ctl: FakeControls): DbOps {
  return {
    async rowCounts() {
      if (!db.readable) throw new Error("database unreadable");
      return { ...db.tables };
    },
    async openSnapshot() {
      if (!db.readable) throw new Error("database unreadable");
      const id = `00000003-0000001B-${++ctl.snapshotsOpened}`;
      const state = { tables: { ...db.tables }, migrations: db.migrations ? [...db.migrations] : null };
      ctl.snapshots[id] = state;
      return {
        id,
        rowCounts: async () => ({ ...state.tables }),
        appliedMigrations: async () => (state.migrations ? [...state.migrations] : null),
        release: async () => {
          delete ctl.snapshots[id];
        },
      };
    },
    async serverInfo() {
      return { serverVersion: "18.4", serverEncoding: db.encoding, datcollate: "C" };
    },
    async appliedMigrations() {
      return db.migrations ? [...db.migrations] : null;
    },
    async recreateDatabase() {
      ctl.events.push("recreateDatabase");
      db.tables = {};
      db.migrations = null;
      db.readable = true;
    },
  };
}

export interface Harness {
  userData: string;
  deps: BackupDeps;
  db: FakeDb;
  ctl: FakeControls;
  setNow(d: Date): void;
  setFree(bytes: number): void;
}

export function makeHarness(appVersion = "0.2.0"): Harness {
  const userData = makeTempUserData();
  const db: FakeDb = {
    tables: { Product: 412, ProductImage: 530, Category: 31, _prisma_migrations: 3 },
    encoding: "UTF8",
    migrations: ["20260901000000_init", "20261006001500_add_shop_sync"],
    readable: true,
  };
  const ctl: FakeControls = { events: [], snapshots: {}, snapshotsOpened: 0, dumpSnapshots: [] };
  let now = new Date(2026, 9, 30, 2, 15, 0);
  let free = 50 * 1024 ** 3;
  const deps: BackupDeps = {
    backupsRoot: path.join(userData, "backups"),
    imagesDir: path.join(userData, "images"),
    appVersion,
    conn: { host: "127.0.0.1", port: 55432, user: "asia_shop", password: "asia_shop", database: "asia_shop" },
    tools: fakeTools(db, ctl),
    db: fakeDbOps(db, ctl),
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => now,
    freeBytes: async () => free,
  };
  return {
    userData,
    deps,
    db,
    ctl,
    setNow: (d) => {
      now = d;
    },
    setFree: (b) => {
      free = b;
    },
  };
}

export function writeImages(imagesDir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(imagesDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

// A finished, verified-looking backup folder without running the engine
// (for retention tests that need many old backups).
export function fabricateBackup(backupsRoot: string, pool: Pool, name: string, bytes = 1000): string {
  const dir = path.join(backupsRoot, pool, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "db.dump"), "x");
  fs.writeFileSync(path.join(dir, "images.zip"), "x");
  const manifest: Manifest = {
    kind: pool,
    createdAt: new Date(2026, 9, 1).toISOString(),
    appVersion: "0.1.5",
    serverVersion: "18.4",
    serverEncoding: "UTF8",
    datcollate: "C",
    lastMigration: null,
    migrations: [],
    rowCounts: { Product: 1 },
    imageCount: 0,
    files: { "db.dump": { bytes, sha256: "a" }, "images.zip": { bytes, sha256: "b" } },
    verified: { pgRestoreList: true, pgRestoreFullRead: true, zipTest: true },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

export function enospc(): Error {
  return new BackupError("diskFull", "pg_dump: error: could not write to output file: No space left on device");
}

export function listDir(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}
