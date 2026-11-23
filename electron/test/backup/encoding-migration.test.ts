import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClusterOps,
  EncodingChecks,
  EncodingMigrationDeps,
  EncodingMigrationState,
  Login,
  MAX_CRASHED_ATTEMPTS,
  ROUND_TRIP_TEXT,
  STATE_FILE,
  migrateClusterToUtf8,
  pruneArchivedCluster,
  readMigrationState,
  recoverEncodingMigration,
} from "../../src/backup/encoding-migration";
import { DbOps, Manifest, PgConnection, PgTools } from "../../src/backup/types";
import { FakeDb, Harness, fabricateBackup, fakeDbOps, fakeTools, listDir, makeHarness } from "./fakes";

// Two fake clusters on disk: each data dir holds PG_VERSION + a "fake-id"
// file, so the renames of the swap move the cluster identity like the real
// thing. Connections are routed to a cluster by port; a stopped cluster
// refuses connections.

type EncDb = FakeDb & { samples: Record<string, string> };

interface Faults {
  toolProblem?: string;
  newEncoding?: string;
  restoreError?: Error;
  afterRestore?: (db: EncDb) => void;
  mangleRoundTrip?: boolean;
}

interface World {
  h: Harness;
  deps: EncodingMigrationDeps;
  oldDb: EncDb;
  pgdata: string;
  newDir: string;
  events: string[];
  faults: Faults;
  clusters: Map<string, EncDb>;
  logins: Map<string, Login>;
  running: Set<string>;
  idOf(dir: string): string | null;
}

const worlds: World[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const w of worlds.splice(0)) fs.rmSync(w.h.userData, { recursive: true, force: true });
});

function nonAscii(s: string): boolean {
  return /[^\x00-\x7f]/.test(s);
}

function setup(encoding = "WIN1252"): World {
  const h = makeHarness();
  const events = h.ctl.events;
  const faults: Faults = {};
  const clusters = new Map<string, EncDb>();
  const logins = new Map<string, Login>();
  const running = new Set<string>();
  const ports = new Map<number, string>();
  const dumpSamples = new Map<string, Record<string, string>>();
  let nextId = 0;
  let nextPort = 56000;

  const idOf = (dir: string) => {
    const f = path.join(dir, "fake-id");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  };
  const makeClusterDir = (dir: string, db: EncDb) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "PG_VERSION"), "18\n");
    const id = `c${++nextId}`;
    fs.writeFileSync(path.join(dir, "fake-id"), id);
    clusters.set(id, db);
    return id;
  };
  const dbAt = (conn: PgConnection): EncDb => {
    const id = ports.get(conn.port);
    if (!id || !running.has(id)) throw new Error(`connect ECONNREFUSED 127.0.0.1:${conn.port}`);
    return clusters.get(id) as EncDb;
  };

  const oldDb = h.db as EncDb;
  oldDb.encoding = encoding;
  oldDb.samples = { p0: "Tofu natur", p1: "Würzöl Pfeffer – scharf €", p2: "Grüntee", p3: "Sojasauce hell" };
  const pgdata = path.join(h.userData, "pgdata");
  const oldId = makeClusterDir(pgdata, oldDb);
  ports.set(h.deps.conn.port, oldId);
  running.add(oldId);

  const tools: PgTools = {
    version: h.deps.tools.version,
    listTableData: h.deps.tools.listTableData,
    fullRead: h.deps.tools.fullRead,
    async dump(conn, file, opts) {
      const db = dbAt(conn);
      await fakeTools(db, h.ctl).dump(conn, file, opts);
      dumpSamples.set(fs.readFileSync(file, "utf8"), { ...db.samples });
    },
    async restore(conn, file) {
      const db = dbAt(conn);
      if (faults.restoreError) {
        events.push("restore");
        throw faults.restoreError;
      }
      await fakeTools(db, h.ctl).restore(conn, file);
      db.samples = { ...(dumpSamples.get(fs.readFileSync(file, "utf8")) ?? {}) };
      faults.afterRestore?.(db);
    },
  };
  const db: DbOps = {
    rowCounts: (conn) => fakeDbOps(dbAt(conn), h.ctl).rowCounts(conn),
    openSnapshot: (conn) => fakeDbOps(dbAt(conn), h.ctl).openSnapshot(conn),
    serverInfo: (conn) => fakeDbOps(dbAt(conn), h.ctl).serverInfo(conn),
    appliedMigrations: (conn) => fakeDbOps(dbAt(conn), h.ctl).appliedMigrations(conn),
    recreateDatabase: (conn) => fakeDbOps(dbAt(conn), h.ctl).recreateDatabase(conn),
  };
  const cluster: ClusterOps = {
    async check() {
      return faults.toolProblem ?? null;
    },
    async initUtf8(dir, login) {
      events.push("initdb");
      if (fs.existsSync(dir)) throw new Error(`initdb: directory "${dir}" exists but is not empty`);
      const id = makeClusterDir(dir, {
        tables: {},
        encoding: faults.newEncoding ?? "UTF8",
        migrations: null,
        readable: true,
        samples: {},
      });
      logins.set(id, login);
    },
    async start(dir) {
      events.push(`start:${path.basename(dir)}`);
      const id = idOf(dir) as string;
      const port = nextPort++;
      ports.set(port, id);
      running.add(id);
      return port;
    },
    async stop(dir) {
      events.push(`stop:${path.basename(dir)}`);
      running.delete(idOf(dir) as string);
    },
  };
  const checks: EncodingChecks = {
    async nonAsciiSamples(conn, n) {
      const d = dbAt(conn);
      const ids = Object.keys(d.samples).sort().filter((id) => nonAscii(d.samples[id]));
      return Object.fromEntries(ids.slice(0, n).map((id) => [id, d.samples[id]]));
    },
    async roundTrip(conn, text) {
      events.push("roundTrip");
      const d = dbAt(conn);
      if (d.encoding !== "UTF8") {
        throw new Error('character with byte sequence 0xe8 0xbe 0x9b in encoding "UTF8" has no equivalent in encoding "WIN1252"');
      }
      return faults.mangleRoundTrip ? text.replace("辛", "?") : text;
    },
  };

  const deps: EncodingMigrationDeps = { ...h.deps, tools, db, userDataDir: h.userData, cluster, checks };
  const w: World = {
    h,
    deps,
    oldDb,
    pgdata,
    newDir: path.join(h.userData, "pgdata-utf8"),
    events,
    faults,
    clusters,
    logins,
    running,
    idOf,
  };
  worlds.push(w);
  return w;
}

function state(w: World): EncodingMigrationState | null {
  return readMigrationState(w.h.userData);
}

function writeState(w: World, patch: Partial<EncodingMigrationState>): void {
  const s: EncodingMigrationState = {
    step: "backup",
    appVersion: w.deps.appVersion,
    startedAt: new Date(2026, 9, 30).toISOString(),
    oldDir: w.pgdata,
    newDir: w.newDir,
    archivedDir: null,
    backupDir: null,
    crashedAttempts: 0,
    doneAt: null,
    archiveDeletedAt: null,
    failedStep: null,
    failedReason: null,
    error: null,
    ...patch,
  };
  fs.writeFileSync(path.join(w.h.userData, STATE_FILE), JSON.stringify(s));
}

function fakeClusterDir(dir: string, id: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "PG_VERSION"), "18\n");
  fs.writeFileSync(path.join(dir, "fake-id"), id);
}

describe("migrateClusterToUtf8 (design 5.1)", () => {
  it("WIN1252: backup, clean stop, initdb UTF8, restore, verify, swap", async () => {
    const w = setup();
    const out = await migrateClusterToUtf8(w.deps);
    expect(out.status).toBe("migrated");
    if (out.status !== "migrated") return;

    // Order: verified backup first, old cluster stopped cleanly before initdb,
    // new cluster stopped before the swap.
    expect(w.events).toEqual([
      "dump",
      "list",
      "fullRead",
      "stop:pgdata",
      "initdb",
      "start:pgdata-utf8",
      "recreateDatabase",
      "restore",
      "roundTrip",
      "stop:pgdata-utf8",
    ]);
    expect(w.running.size).toBe(0);

    // pgdata is now the new UTF8 cluster with the same data; the old one is archived.
    const newDb = w.clusters.get(w.idOf(w.pgdata) as string) as EncDb;
    expect(newDb).not.toBe(w.oldDb);
    expect(newDb.encoding).toBe("UTF8");
    expect(newDb.tables).toEqual(w.oldDb.tables);
    expect(newDb.migrations).toEqual(w.oldDb.migrations);
    expect(newDb.samples["p1"]).toBe("Würzöl Pfeffer – scharf €");
    expect(out.rowCounts).toEqual(w.oldDb.tables);
    expect(out.archivedDir).toBe(path.join(w.h.userData, "pgdata-win1252-20261030"));
    expect(w.clusters.get(w.idOf(out.archivedDir) as string)).toBe(w.oldDb);
    expect(fs.existsSync(w.newDir)).toBe(false);

    // The backup is in the never-pruned pool and records the old encoding.
    expect(listDir(path.join(w.deps.backupsRoot, "encoding-migration"))).toHaveLength(1);
    const manifest = JSON.parse(fs.readFileSync(path.join(out.backupDir, "manifest.json"), "utf8")) as Manifest;
    expect(manifest).toMatchObject({ kind: "encoding-migration", serverEncoding: "WIN1252" });

    expect(state(w)).toMatchObject({ step: "done", archivedDir: out.archivedDir, backupDir: out.backupDir });
    expect(recoverEncodingMigration(w.deps)).toEqual({ status: "none", prunedArchive: null });
  });

  it("the new cluster gets the new login (#3113) when one is passed", async () => {
    const w = setup();
    const newLogin = { user: "asia_shop", password: "per-install-secret" };
    const out = await migrateClusterToUtf8({ ...w.deps, newLogin });
    expect(out.status).toBe("migrated");
    expect(w.logins.get(w.idOf(w.pgdata) as string)).toEqual(newLogin);
    // Never written to disk by the migration.
    expect(fs.readFileSync(path.join(w.h.userData, STATE_FILE), "utf8")).not.toContain("per-install-secret");
  });

  it("already UTF8: does nothing", async () => {
    const w = setup("UTF8");
    expect(await migrateClusterToUtf8(w.deps)).toEqual({ status: "not-needed", encoding: "UTF8" });
    expect(w.events).toEqual([]);
    expect(state(w)).toBeNull();
  });

  it("backup fails (corrupt dump): never migrates, old cluster keeps running", async () => {
    const w = setup();
    w.h.ctl.truncateDump = true;
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", step: "backup", reason: "corrupt", oldClusterStopped: false });
    expect(w.events).not.toContain("stop:pgdata");
    expect(w.events).not.toContain("initdb");
    expect(w.running.has(w.idOf(w.pgdata) as string)).toBe(true);
    expect(fs.existsSync(w.newDir)).toBe(false);
    expect(listDir(path.join(w.deps.backupsRoot, "encoding-migration"))).toEqual([]);
    // Same version, not a disk/tool problem: refuse on the next boot.
    expect(recoverEncodingMigration(w.deps).status).toBe("failed");
  });

  it("disk full: never migrates; retried on the next boot", async () => {
    const w = setup();
    fabricateBackup(w.deps.backupsRoot, "daily", "2026-10-29_021500_v0.1.5", 200 * 1024 * 1024);
    w.h.setFree(100 * 1024 * 1024);
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", reason: "diskFull", oldClusterStopped: false });
    expect(w.events).toEqual([]);
    expect(recoverEncodingMigration(w.deps)).toEqual({ status: "none", prunedArchive: null });
    expect(state(w)).toBeNull();
  });

  it("no room for the new cluster after the backup: old cluster not stopped", async () => {
    const w = setup();
    fs.writeFileSync(path.join(w.pgdata, "big"), Buffer.alloc(4096));
    let calls = 0;
    // First call (backup free-space check) passes, second (new cluster) fails.
    w.deps.freeBytes = async () => (++calls === 1 ? 50 * 1024 ** 3 : 1024);
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", step: "backup", reason: "diskFull", oldClusterStopped: false });
    expect(w.events).not.toContain("stop:pgdata");
  });

  it("initdb/pg_ctl missing: nothing touched, no backup taken", async () => {
    const w = setup();
    w.faults.toolProblem = "pg_ctl missing at C:\\x\\pg_ctl.exe";
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", reason: "toolMissing", oldClusterStopped: false });
    expect(w.events).toEqual([]);
  });

  it("restore fails: new cluster stopped and removed, pgdata untouched", async () => {
    const w = setup();
    w.faults.restoreError = new Error("pg_restore: error: could not execute query");
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", step: "restore", reason: "unknown", oldClusterStopped: true });
    expect(w.events.slice(-2)).toEqual(["restore", "stop:pgdata-utf8"]);
    expect(fs.existsSync(w.newDir)).toBe(false);
    expect(w.clusters.get(w.idOf(w.pgdata) as string)).toBe(w.oldDb);
    expect(w.running.size).toBe(0);
    expect(state(w)).toMatchObject({ step: "failed", failedStep: "restore" });

    // Same version: refuse to start. A new release tries again.
    expect(recoverEncodingMigration(w.deps).status).toBe("failed");
    expect(recoverEncodingMigration({ ...w.deps, appVersion: "0.2.1" })).toEqual({ status: "none", prunedArchive: null });
  });

  it.each<[string, (w: World) => void, RegExp]>([
    ["row count differs", (w) => (w.faults.afterRestore = (db) => (db.tables.Product -= 1)), /row counts differ: Product: 412 -> 411/],
    ["migrations differ", (w) => (w.faults.afterRestore = (db) => (db.migrations = ["20260901000000_init"])), /_prisma_migrations differ/],
    ["still not UTF8", (w) => (w.faults.newEncoding = "WIN1252"), /server_encoding is WIN1252/],
    ["umlaut changed", (w) => (w.faults.afterRestore = (db) => (db.samples.p1 = "Wurzol Pfeffer - scharf EUR")), /umlaut/],
    ["CJK/Thai round trip broken", (w) => (w.faults.mangleRoundTrip = true), /round trip returned/],
  ])("verify fails (%s): no swap, pgdata untouched", async (_name, arrange, error) => {
    const w = setup();
    arrange(w);
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", step: "verify", reason: "verify", oldClusterStopped: true });
    if (out.status === "failed") expect(out.error).toMatch(error);
    expect(fs.existsSync(w.newDir)).toBe(false);
    expect(w.clusters.get(w.idOf(w.pgdata) as string)).toBe(w.oldDb);
    expect(listDir(w.h.userData).filter((n) => n.startsWith("pgdata-win1252-"))).toEqual([]);
    expect(w.running.size).toBe(0);
  });

  it("swap rename fails: verified cluster kept, next boot finishes the swap", async () => {
    const w = setup();
    const real = fs.renameSync;
    const spy = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (from === w.pgdata) throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
      return real(from, to);
    });
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", step: "verified", oldClusterStopped: true });
    expect(fs.existsSync(path.join(w.newDir, "PG_VERSION"))).toBe(true);
    expect(state(w)?.step).toBe("verified");

    spy.mockRestore();
    const rec = recoverEncodingMigration(w.deps);
    expect(rec).toMatchObject({ status: "finished-swap" });
    expect(w.clusters.get(w.idOf(w.pgdata) as string)?.encoding).toBe("UTF8");
    expect(state(w)?.step).toBe("done");
  });

  it("refuses when a state file from an unfinished run is still there (recover not called)", async () => {
    const w = setup();
    writeState(w, { step: "verified", archivedDir: path.join(w.h.userData, "pgdata-win1252-20261029") });
    const before = fs.readFileSync(path.join(w.h.userData, STATE_FILE), "utf8");
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", reason: "unknown", oldClusterStopped: false });
    expect(w.events).toEqual([]);
    expect(fs.readFileSync(path.join(w.h.userData, STATE_FILE), "utf8")).toBe(before);
  });
});

describe("recoverEncodingMigration (crash resume)", () => {
  it("no state file: boot normally", () => {
    const w = setup();
    expect(recoverEncodingMigration(w.deps)).toEqual({ status: "none", prunedArchive: null });
  });

  it.each(["backup", "stop-old", "init-new", "restore", "verify"] as const)(
    "crash in step %s: pgdata-utf8 removed, old cluster untouched, runs again",
    async (step) => {
      const w = setup();
      fakeClusterDir(w.newDir, "half-done");
      writeState(w, { step });
      expect(recoverEncodingMigration(w.deps)).toEqual({ status: "rolled-back" });
      expect(fs.existsSync(w.newDir)).toBe(false);
      expect(w.clusters.get(w.idOf(w.pgdata) as string)).toBe(w.oldDb);
      expect(state(w)).toMatchObject({ step: "rolled-back", crashedAttempts: 1, failedStep: step });

      // Next boot: old cluster starts, still WIN1252, migration runs again.
      expect((await migrateClusterToUtf8(w.deps)).status).toBe("migrated");
    },
  );

  it(`gives up after ${MAX_CRASHED_ATTEMPTS} crashes`, async () => {
    const w = setup();
    writeState(w, { step: "restore", crashedAttempts: MAX_CRASHED_ATTEMPTS - 1 });
    expect(recoverEncodingMigration(w.deps).status).toBe("rolled-back");
    const out = await migrateClusterToUtf8(w.deps);
    expect(out).toMatchObject({ status: "failed", oldClusterStopped: false });
    expect(w.events).toEqual([]);
    expect(recoverEncodingMigration(w.deps).status).toBe("failed");
  });

  it("crash before verify but pgdata gone: unclear, nothing deleted", () => {
    const w = setup();
    fs.rmSync(w.pgdata, { recursive: true });
    fakeClusterDir(w.newDir, "half-done");
    writeState(w, { step: "restore" });
    expect(recoverEncodingMigration(w.deps).status).toBe("unclear");
    expect(fs.existsSync(w.newDir)).toBe(true);
  });

  it("crash after verify, before any rename: both renames done now", () => {
    const w = setup();
    const archivedDir = path.join(w.h.userData, "pgdata-win1252-20261030");
    fakeClusterDir(w.newDir, "new");
    writeState(w, { step: "verified", archivedDir });
    expect(recoverEncodingMigration(w.deps)).toEqual({ status: "finished-swap", archivedDir });
    expect(w.idOf(w.pgdata)).toBe("new");
    expect(w.clusters.get(w.idOf(archivedDir) as string)).toBe(w.oldDb);
    expect(state(w)?.step).toBe("done");
  });

  it("crash between the two renames: second rename done now", () => {
    const w = setup();
    const archivedDir = path.join(w.h.userData, "pgdata-win1252-20261030");
    fs.renameSync(w.pgdata, archivedDir);
    fakeClusterDir(w.newDir, "new");
    writeState(w, { step: "verified", archivedDir });
    expect(recoverEncodingMigration(w.deps).status).toBe("finished-swap");
    expect(w.idOf(w.pgdata)).toBe("new");
    expect(fs.existsSync(w.newDir)).toBe(false);
  });

  it("crash after both renames, before the state write: marked done", () => {
    const w = setup();
    const archivedDir = path.join(w.h.userData, "pgdata-win1252-20261030");
    fs.renameSync(w.pgdata, archivedDir);
    fakeClusterDir(w.pgdata, "new");
    writeState(w, { step: "verified", archivedDir });
    expect(recoverEncodingMigration(w.deps).status).toBe("finished-swap");
    expect(w.idOf(w.pgdata)).toBe("new");
    expect(state(w)?.step).toBe("done");
  });

  it("verified but dirs in an unknown shape: unclear, nothing deleted", () => {
    const w = setup();
    const archivedDir = path.join(w.h.userData, "pgdata-win1252-20261030");
    writeState(w, { step: "verified", archivedDir }); // pgdata there, no pgdata-utf8, no archive
    expect(recoverEncodingMigration(w.deps).status).toBe("unclear");
    expect(w.clusters.get(w.idOf(w.pgdata) as string)).toBe(w.oldDb);
    expect(state(w)?.step).toBe("verified");
  });
});

describe("pruneArchivedCluster (design 5.1.12)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  function utf8Daily(w: World, name: string, createdAt: Date, encoding = "UTF8"): void {
    const dir = fabricateBackup(w.deps.backupsRoot, "daily", name);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...m, createdAt: createdAt.toISOString(), serverEncoding: encoding }));
  }

  function doneWorld(daysAgo: number): { w: World; archivedDir: string; doneAt: Date } {
    const w = setup();
    const archivedDir = path.join(w.h.userData, "pgdata-win1252-20260929");
    fakeClusterDir(archivedDir, "old");
    const doneAt = new Date(w.deps.now!().getTime() - daysAgo * DAY);
    writeState(w, { step: "done", archivedDir, doneAt: doneAt.toISOString() });
    return { w, archivedDir, doneAt };
  }

  it("deletes the old cluster after 30 days and 3 verified UTF8 dailies", () => {
    const { w, archivedDir, doneAt } = doneWorld(31);
    for (let i = 1; i <= 3; i++) utf8Daily(w, `2026-10-0${i}_021500_v0.2.0`, new Date(doneAt.getTime() + i * DAY));
    expect(recoverEncodingMigration(w.deps)).toEqual({ status: "none", prunedArchive: archivedDir });
    expect(fs.existsSync(archivedDir)).toBe(false);
    expect(state(w)?.archiveDeletedAt).not.toBeNull();
  });

  it("keeps it before 30 days", () => {
    const { w, archivedDir, doneAt } = doneWorld(29);
    for (let i = 1; i <= 5; i++) utf8Daily(w, `2026-10-0${i}_021500_v0.2.0`, new Date(doneAt.getTime() + i * DAY));
    expect(pruneArchivedCluster(w.deps, state(w) as EncodingMigrationState)).toBeNull();
    expect(fs.existsSync(archivedDir)).toBe(true);
  });

  it("keeps it with fewer than 3 UTF8 dailies after the migration", () => {
    const { w, archivedDir, doneAt } = doneWorld(40);
    utf8Daily(w, "2026-10-01_021500_v0.2.0", new Date(doneAt.getTime() + DAY));
    utf8Daily(w, "2026-10-02_021500_v0.2.0", new Date(doneAt.getTime() + 2 * DAY));
    utf8Daily(w, "2026-09-01_021500_v0.1.5", new Date(doneAt.getTime() - DAY)); // before the migration
    utf8Daily(w, "2026-10-03_021500_v0.2.0", new Date(doneAt.getTime() + 3 * DAY), "WIN1252");
    expect(pruneArchivedCluster(w.deps, state(w) as EncodingMigrationState)).toBeNull();
    expect(fs.existsSync(archivedDir)).toBe(true);
  });
});

it("ROUND_TRIP_TEXT covers umlaut, €, en dash, CJK and Thai", () => {
  expect(ROUND_TRIP_TEXT).toMatch(/ö/);
  expect(ROUND_TRIP_TEXT).toMatch(/€/);
  expect(ROUND_TRIP_TEXT).toMatch(/–/);
  expect(ROUND_TRIP_TEXT).toMatch(/辛拉面/);
  expect(ROUND_TRIP_TEXT).toMatch(/มาม่า/);
});
