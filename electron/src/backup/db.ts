import { Client } from "pg";
import { DbOps, DbSnapshot, PgConnection, ServerInfo } from "./types";

// SQL side of the engine via node-postgres (no psql needed, design section 1).

function newClient(conn: PgConnection): Client {
  return new Client({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
  });
}

async function withClient<T>(conn: PgConnection, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = newClient(conn);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function countRows(c: Client): Promise<Record<string, number>> {
  const tables = await c.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const counts: Record<string, number> = {};
  for (const { tablename } of tables.rows) {
    const r = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${quoteIdent(tablename)}`);
    counts[tablename] = Number(r.rows[0].n);
  }
  return counts;
}

async function queryMigrations(c: Client): Promise<string[] | null> {
  const exists = await c.query<{ t: string | null }>("SELECT to_regclass('public._prisma_migrations')::text AS t");
  if (!exists.rows[0].t) return null;
  const r = await c.query<{ migration_name: string }>(
    "SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1",
  );
  return r.rows.map((row) => row.migration_name);
}

export async function readRowCounts(conn: PgConnection): Promise<Record<string, number>> {
  return withClient(conn, countRows);
}

// #3111: the manifest counts and pg_dump must see the same data. In REPEATABLE
// READ the first statement fixes the snapshot, so pg_export_snapshot() goes
// first; every count after it and pg_dump --snapshot=<id> read that state.
// The transaction has to stay open until pg_dump has started (we keep it
// until the dump is done).
export async function openDumpSnapshot(conn: PgConnection): Promise<DbSnapshot> {
  const client = newClient(conn);
  // An idle connection that drops would otherwise emit an unhandled 'error'.
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const r = await client.query<{ id: string }>("SELECT pg_export_snapshot() AS id");
    return {
      id: r.rows[0].id,
      rowCounts: () => countRows(client),
      appliedMigrations: () => queryMigrations(client),
      async release() {
        await client.query("COMMIT").catch(() => undefined);
        await client.end().catch(() => undefined);
      },
    };
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
}

export async function readServerInfo(conn: PgConnection): Promise<ServerInfo> {
  return withClient(conn, async (c) => {
    const v = await c.query<{ server_version: string }>("SHOW server_version");
    const e = await c.query<{ server_encoding: string }>("SHOW server_encoding");
    const d = await c.query<{ datcollate: string }>("SELECT datcollate FROM pg_database WHERE datname = current_database()");
    return {
      serverVersion: v.rows[0].server_version,
      serverEncoding: e.rows[0].server_encoding,
      datcollate: d.rows[0]?.datcollate ?? "",
    };
  });
}

export async function readAppliedMigrations(conn: PgConnection): Promise<string[] | null> {
  return withClient(conn, queryMigrations);
}

// Design 4 step 4. Connects to the maintenance db "postgres"; also used by
// the WIN1252 migration to create the db on the new cluster (IF EXISTS makes
// the DROP a no-op there).
export async function recreateUtf8Database(conn: PgConnection): Promise<void> {
  await withClient({ ...conn, database: "postgres" }, async (c) => {
    const db = quoteIdent(conn.database);
    await c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await c.query(
      `CREATE DATABASE ${db} OWNER ${quoteIdent(conn.user)} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
  });
}

export const pgDbOps: DbOps = {
  rowCounts: readRowCounts,
  openSnapshot: openDumpSnapshot,
  serverInfo: readServerInfo,
  appliedMigrations: readAppliedMigrations,
  recreateDatabase: recreateUtf8Database,
};
