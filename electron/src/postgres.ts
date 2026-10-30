import EmbeddedPostgres from "embedded-postgres";
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import log from "electron-log";
import { pgDataDir } from "./paths";
import { findFreePort } from "./find-free-port";
import { UTF8_INITDB_FLAGS } from "./backup/encoding-cluster";
import { recreateUtf8Database } from "./backup";
import type { Login } from "./backup/encoding-migration";
import {
  embeddedPostgresSecurityOptions,
  LEGACY_DB_PASSWORD,
  prepareFreshDbCredential,
  resolveExistingDbCredential,
  withPrivateUmask,
} from "./db-credential";

const PG_USER = "asia_shop";
const PG_DATABASE = "asia_shop";

export interface RunningPostgres {
  databaseUrl: string;
  // Per-install credential (#3113). main.ts hands it to the UTF8 re-init as
  // newLogin, so the new cluster is initdb'd with the same value.
  login: Login;
  stop(): Promise<void>;
}

// Never hardcode 5432 — a developer running this repo's own docker-compose.yml
// Postgres alongside the packaged app would otherwise collide with it.
export async function startEmbeddedPostgres(): Promise<RunningPostgres> {
  const dataDir = pgDataDir();
  const port = await findFreePort();
  const isFirstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

  const credDeps = {
    dir: app.getPath("userData"),
    safeStorage,
    warn: (m: string) => log.warn("[db-credential]", m),
  };
  // Only initdb reads the password; start() ignores it.
  const initialPassword = isFirstRun ? prepareFreshDbCredential(credDeps) : LEGACY_DB_PASSWORD;

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: PG_USER,
    password: initialPassword,
    persistent: true,
    // The library default inherits the Windows locale (WIN1252), which cannot
    // store Thai/Chinese nameOriginal (review must 1).
    initdbFlags: UTF8_INITDB_FLAGS,
    // scram-sha-256 in pg_hba, listen on 127.0.0.1 only (#3071/#3113).
    ...embeddedPostgresSecurityOptions(),
    onLog: (message) => log.info("[postgres]", message),
    onError: (message) => log.error("[postgres]", message),
  });

  if (isFirstRun) {
    log.info(`Initialising new Postgres cluster at ${dataDir}`);
    await withPrivateUmask(() => pg.initialise());
  }

  await pg.start();

  // Legacy clusters (asia_shop/asia_shop) are moved to the per-install value
  // here, once, before anything else (backup, UTF8 re-init) logs in.
  const dbPassword = isFirstRun
    ? initialPassword
    : await resolveExistingDbCredential({
        ...credDeps,
        user: PG_USER,
        hbaPath: path.join(dataDir, "pg_hba.conf"),
        connect: async (candidate) => {
          const client = new Client({ host: "127.0.0.1", port, user: PG_USER, password: candidate, database: "postgres" });
          await client.connect();
          return client;
        },
      });

  if (isFirstRun) {
    // Not pg.createDatabase(): plain CREATE DATABASE has no encoding option.
    await recreateUtf8Database({ host: "127.0.0.1", port, user: PG_USER, password: dbPassword, database: PG_DATABASE });
  }

  // Env-only (DATABASE_URL for Next/Prisma), never logged, never argv.
  const databaseUrl = `postgresql://${PG_USER}:${encodeURIComponent(dbPassword)}@127.0.0.1:${port}/${PG_DATABASE}?schema=public`;

  return {
    databaseUrl,
    login: { user: PG_USER, password: dbPassword },
    stop: () => pg.stop(),
  };
}
