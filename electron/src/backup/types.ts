// Backup/restore engine for the embedded Postgres + images folder (#3060 must 10).
// Design: storage's atg-pg-backup-design.md (#3068). Section numbers in comments
// ("2.2", "3.3", ...) refer to that document.
//
// Nothing in backup/ imports electron: every path, tool and clock is passed in
// via BackupDeps, so the engine runs under vitest with fakes and a temp dir.

export type Pool = "daily" | "pre-migrate" | "manual" | "pre-restore" | "encoding-migration";

export const POOLS: Pool[] = ["daily", "pre-migrate", "manual", "pre-restore", "encoding-migration"];

// Fixed short reasons, mapped to UI text by web (files' UX spec 1.3, backup.reason.*).
// Raw errors only go to the log.
export type FailureReason = "diskFull" | "corrupt" | "interrupted" | "toolMissing" | "unknown";

export interface PgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ManifestFile {
  bytes: number;
  sha256: string;
}

export interface Manifest {
  kind: Pool;
  createdAt: string;
  appVersion: string;
  serverVersion: string;
  serverEncoding: string;
  datcollate: string;
  lastMigration: string | null;
  migrations: string[];
  rowCounts: Record<string, number>;
  imageCount: number;
  files: { "db.dump": ManifestFile; "images.zip": ManifestFile };
  verified: { pgRestoreList: boolean; pgRestoreFullRead: boolean; zipTest: boolean };
}

export interface BackupInfo {
  pool: Pool;
  name: string;
  dir: string;
  manifest: Manifest;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// pg_dump / pg_restore wrapper (pg-tools.ts in production, a fake in tests).
export interface PgTools {
  version(tool: "pg_dump" | "pg_restore"): Promise<string>;
  dump(conn: PgConnection, file: string): Promise<void>;
  // Table names that have a "TABLE DATA public <name>" TOC entry.
  listTableData(file: string): Promise<string[]>;
  // pg_restore -f NUL: reads and decompresses every data block.
  fullRead(file: string): Promise<void>;
  restore(conn: PgConnection, file: string): Promise<void>;
}

export interface ServerInfo {
  serverVersion: string;
  serverEncoding: string;
  datcollate: string;
}

// SQL side via node-postgres (db.ts in production, a fake in tests).
export interface DbOps {
  rowCounts(conn: PgConnection): Promise<Record<string, number>>;
  serverInfo(conn: PgConnection): Promise<ServerInfo>;
  // null = _prisma_migrations does not exist (fresh database).
  appliedMigrations(conn: PgConnection): Promise<string[] | null>;
  // DROP ... WITH (FORCE) + CREATE ... UTF8 TEMPLATE template0, connected to db "postgres".
  recreateDatabase(conn: PgConnection): Promise<void>;
}

export interface BackupDeps {
  backupsRoot: string; // userData/backups
  imagesDir: string; // userData/images
  appVersion: string;
  conn: PgConnection;
  tools: PgTools;
  db: DbOps;
  log: Logger;
  now?: () => Date;
  // Free bytes on the volume holding `dir`. Default: fs.promises.statfs.
  freeBytes?: (dir: string) => Promise<number>;
}

export type BackupResult =
  | { ok: true; backup: BackupInfo; pruned: string[] }
  | { ok: false; reason: FailureReason; error: string };

export class BackupError extends Error {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}
