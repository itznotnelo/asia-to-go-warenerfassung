import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { pgDataDir } from "./paths";
import { findFreePort } from "./find-free-port";

const PG_USER = "asia_shop";
const PG_PASSWORD = "asia_shop";
const PG_DATABASE = "asia_shop";

export interface RunningPostgres {
  databaseUrl: string;
  stop(): Promise<void>;
}

// Never hardcode 5432 — a developer running this repo's own docker-compose.yml
// Postgres alongside the packaged app would otherwise collide with it.
export async function startEmbeddedPostgres(): Promise<RunningPostgres> {
  const dataDir = pgDataDir();
  const port = await findFreePort();
  const isFirstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent: true,
    onLog: (message) => log.info("[postgres]", message),
    onError: (message) => log.error("[postgres]", message),
  });

  if (isFirstRun) {
    log.info(`Initialising new Postgres cluster at ${dataDir}`);
    await pg.initialise();
  }

  await pg.start();

  if (isFirstRun) {
    await pg.createDatabase(PG_DATABASE);
  }

  const databaseUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${PG_DATABASE}?schema=public`;

  return {
    databaseUrl,
    stop: () => pg.stop(),
  };
}
