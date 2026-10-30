import EmbeddedPostgres from "embedded-postgres";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { ClusterOps, EncodingChecks, Login } from "./encoding-migration";
import { BackupError, Logger, PgConnection } from "./types";

// Production side of encoding-migration.ts: the cluster lifecycle via
// embedded-postgres (initdb, postgres) + its own pg_ctl, and the SQL checks
// of design 5.1.8 via node-postgres.

// Same flags for a fresh install (postgres.ts, must 1) and the re-init here.
// embedded-postgres adds --lc-messages=C itself.
export const UTF8_INITDB_FLAGS = ["--encoding=UTF8", "--locale=C"];

// pg_ctl ships in embedded-postgres' platform package, next to initdb.
// appDir = electron/app (main.ts' __dirname), where node_modules lives (asar: false).
export function embeddedPgCtlPath(appDir: string): string {
  const win = process.platform === "win32";
  const pkg = win ? "windows-x64" : process.platform === "darwin" ? `darwin-${process.arch}` : `linux-${process.arch}`;
  return path.join(appDir, "node_modules", "@embedded-postgres", pkg, "native", "bin", win ? "pg_ctl.exe" : "pg_ctl");
}

export interface EmbeddedClusterOptions {
  pgCtlPath: string;
  findFreePort: () => Promise<number>;
  authMethod?: "scram-sha-256" | "password" | "md5";
  postgresFlags?: string[];
  log: Logger;
}

function runPgCtl(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { windowsHide: true, timeout: 120_000 }, (err, _stdout, stderr) => {
      if (!err) return resolve();
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EACCES") {
        return reject(new BackupError("toolMissing", `pg_ctl not runnable: ${err.message}`));
      }
      reject(new Error(`pg_ctl ${args[0]} failed (${err.message}): ${stderr.trim()}`));
    });
  });
}

export function embeddedClusterOps(o: EmbeddedClusterOptions): ClusterOps {
  // The login only matters for initdb (--username/--pwfile); start() ignores it.
  const instance = (dataDir: string, login: Login | null, port = 0) =>
    new EmbeddedPostgres({
      databaseDir: dataDir,
      port,
      ...(login ? { user: login.user, password: login.password } : {}),
      persistent: true,
      ...(o.authMethod ? { authMethod: o.authMethod } : {}),
      initdbFlags: UTF8_INITDB_FLAGS,
      postgresFlags: o.postgresFlags ?? [],
      onLog: (m) => o.log.info("[postgres-utf8]", m),
      onError: (m) => o.log.error("[postgres-utf8]", m),
    });

  return {
    async check() {
      if (!fs.existsSync(o.pgCtlPath)) return `pg_ctl missing at ${o.pgCtlPath}`;
      try {
        await runPgCtl(o.pgCtlPath, ["--version"]);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    async initUtf8(dataDir, login) {
      if (fs.existsSync(dataDir)) throw new Error(`${dataDir} already exists`);
      await instance(dataDir, login).initialise();
    },
    async start(dataDir) {
      const port = await o.findFreePort();
      // Not kept: it is stopped with pg_ctl below, never with its taskkill /f stop().
      await instance(dataDir, null, port).start();
      return port;
    },
    async stop(dataDir) {
      await runPgCtl(o.pgCtlPath, ["stop", "-D", dataDir, "-m", "fast", "-w", "-t", "60"]);
    },
  };
}

// ---- SQL checks (design 5.1.8) ----

async function withClient<T>(conn: PgConnection, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function hasProductTable(c: Client): Promise<boolean> {
  const r = await c.query<{ t: string | null }>(`SELECT to_regclass('public."Product"')::text AS t`);
  return Boolean(r.rows[0].t);
}

export const pgEncodingChecks: EncodingChecks = {
  async nonAsciiSamples(conn, n) {
    return withClient(conn, async (c) => {
      if (!(await hasProductTable(c))) return {};
      // More UTF8 bytes than characters = not plain ASCII. Works on WIN1252 and UTF8 servers.
      const r = await c.query<{ id: string; nameDe: string }>(
        `SELECT id, "nameDe" FROM public."Product"
          WHERE octet_length(convert_to("nameDe", 'UTF8')) <> char_length("nameDe")
          ORDER BY id LIMIT $1`,
        [n],
      );
      return Object.fromEntries(r.rows.map((row) => [row.id, row.nameDe]));
    });
  },

  async roundTrip(conn, text) {
    return withClient(conn, async (c) => {
      await c.query("BEGIN");
      try {
        let back: string | undefined;
        if (await hasProductTable(c)) {
          const r = await c.query<{ v: string }>(
            `UPDATE public."Product" SET "nameOriginal" = $1
              WHERE id = (SELECT id FROM public."Product" ORDER BY id LIMIT 1)
              RETURNING "nameOriginal" AS v`,
            [text],
          );
          back = r.rows[0]?.v;
        }
        if (back === undefined) {
          // No products yet (design 5.1.8): a temp table proves the same.
          await c.query("CREATE TEMP TABLE encoding_check (v text)");
          const r = await c.query<{ v: string }>("INSERT INTO encoding_check VALUES ($1) RETURNING v", [text]);
          back = r.rows[0].v;
        }
        return back;
      } finally {
        // Always: nothing may be left behind.
        await c.query("ROLLBACK");
      }
    });
  },
};
