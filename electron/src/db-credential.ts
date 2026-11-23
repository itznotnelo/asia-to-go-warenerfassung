import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Per-install Postgres credential for the embedded cluster (review #43, spec #3071 3/3).
//
// The cluster used to run on the public asia_shop/asia_shop login, so any local
// process or other Windows account could read orders and the device key. Now
// every install gets a random 32-byte value, stored in userData via Electron's
// safeStorage (DPAPI on Windows, bound to the Windows user). Trust boundary:
// malware running as the same Windows user can still decrypt it.
//
// Rules: the value is never logged, never put in an error message and never
// passed on a command line. This module takes no electron/pg imports on purpose
// (deps are injected), so it is testable without a cluster.

export const LEGACY_DB_PASSWORD = "asia_shop";
export const DB_CREDENTIAL_FILE = "db-credential.bin";
export const DB_CREDENTIAL_TMP_FILE = "db-credential.bin.tmp";

const TAG_ENCRYPTED = 0x01;
const TAG_PLAIN = 0x00;

export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface DbCredentialDeps {
  /** app.getPath("userData") */
  dir: string;
  /** Electron's safeStorage; only usable after app "ready". */
  safeStorage: SecretBox;
  warn(message: string): void;
}

/** The two calls the migration needs from a pg Client. */
export interface PgSession {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

export interface ExistingClusterDeps extends DbCredentialDeps {
  /** Role the app logs in as (asia_shop). */
  user: string;
  /** Path to the cluster's pg_hba.conf. */
  hbaPath: string;
  /** Open a session to the "postgres" database at 127.0.0.1 with this password; reject on failure. */
  connect(password: string): Promise<PgSession>;
}

/** Options to spread into `new EmbeddedPostgres({...})`. */
export function embeddedPostgresSecurityOptions(): {
  authMethod: "scram-sha-256";
  postgresFlags: string[];
} {
  return {
    authMethod: "scram-sha-256",
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  };
}

/**
 * Run an initdb with umask 077. embedded-postgres' initialise() writes the
 * --pwfile to os.tmpdir() with the default mode (0644 under umask 022). No-op
 * on Windows, where %TEMP% is per-user and the mode is ignored.
 */
export async function withPrivateUmask<T>(fn: () => Promise<T>): Promise<T> {
  if (process.platform === "win32") return fn();
  const previous = process.umask(0o077);
  try {
    return await fn();
  } finally {
    process.umask(previous);
  }
}

export function generateDbCredential(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Same algorithm as pg's utils.escapeLiteral / escapeIdentifier (pg is not a
// dependency of electron/src). ALTER ROLE takes no bind parameters.
export function escapeLiteral(value: string): string {
  let hasBackslash = false;
  let escaped = "'";
  for (const c of value) {
    if (c === "'") {
      escaped += "''";
    } else if (c === "\\") {
      escaped += "\\\\";
      hasBackslash = true;
    } else {
      escaped += c;
    }
  }
  escaped += "'";
  return hasBackslash ? ` E${escaped}` : escaped;
}

export function escapeIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function alterRolePasswordSql(user: string, password: string): string {
  return `ALTER ROLE ${escapeIdentifier(user)} WITH PASSWORD ${escapeLiteral(password)}`;
}

const WEAK_METHODS = new Set(["trust", "password", "md5"]);

/** Rewrites every active trust/password/md5 line to scram-sha-256. Comments are kept. */
export function hardenPgHba(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return line;
      // Method is the 4th field for "local", the 5th for host* lines; options may follow.
      const fields = trimmed.split(/\s+/);
      const methodIndex = fields[0] === "local" ? 3 : 4;
      const method = fields[methodIndex];
      if (!method || !WEAK_METHODS.has(method)) return line;
      fields[methodIndex] = "scram-sha-256";
      return fields.join("\t");
    })
    .join("\n");
}

export function pgHbaIsHardened(text: string): boolean {
  return hardenPgHba(text) === text;
}

function writePrivateFile(file: string, data: Buffer): void {
  // Write next to the target and rename, so a crash never leaves a half file.
  // On Windows the mode is ignored; userData sits in the user's %APPDATA%, which
  // inherits the profile ACL (user, SYSTEM, Administrators only).
  const part = `${file}.part`;
  const fd = fs.openSync(part, "w", 0o600);
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(part, file);
}

export function writeStoredCredential(file: string, value: string, deps: DbCredentialDeps): void {
  let data: Buffer;
  if (deps.safeStorage.isEncryptionAvailable()) {
    data = Buffer.concat([Buffer.from([TAG_ENCRYPTED]), deps.safeStorage.encryptString(value)]);
  } else {
    deps.warn("safeStorage nicht verfügbar: DB-Zugang wird unverschlüsselt im Benutzerprofil gespeichert");
    data = Buffer.concat([Buffer.from([TAG_PLAIN]), Buffer.from(value, "utf8")]);
  }
  writePrivateFile(file, data);
}

/** Returns null if the file is missing or unreadable (e.g. DPAPI key lost after a profile reset). */
export function readStoredCredential(file: string, deps: DbCredentialDeps): string | null {
  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch {
    return null;
  }
  try {
    if (data[0] === TAG_ENCRYPTED) {
      const value = deps.safeStorage.decryptString(data.subarray(1));
      return value.length > 0 ? value : null;
    }
    if (data[0] === TAG_PLAIN && data.length > 1) {
      return data.subarray(1).toString("utf8");
    }
  } catch {
    // fall through
  }
  deps.warn(`${path.basename(file)} nicht lesbar, wird ignoriert`);
  return null;
}

/**
 * Fresh install (no PG_VERSION yet): returns the credential to pass to
 * EmbeddedPostgres for initdb. Reuses an existing .bin (crash between writing
 * it and initdb, or a cluster re-init such as the UTF8 migration), else
 * generates and stores a new one before initdb runs.
 */
export function prepareFreshDbCredential(deps: DbCredentialDeps): string {
  const file = path.join(deps.dir, DB_CREDENTIAL_FILE);
  const existing = readStoredCredential(file, deps);
  if (existing) return existing;
  const value = generateDbCredential();
  writeStoredCredential(file, value, deps);
  fs.rmSync(path.join(deps.dir, DB_CREDENTIAL_TMP_FILE), { force: true });
  return value;
}

async function tryConnect(deps: ExistingClusterDeps, password: string): Promise<PgSession | null> {
  try {
    return await deps.connect(password);
  } catch {
    // Deliberately swallowed: auth errors carry nothing useful and must never
    // end up next to a credential in a log line.
    return null;
  }
}

async function ensureHbaHardened(deps: ExistingClusterDeps, session: PgSession): Promise<void> {
  const current = fs.readFileSync(deps.hbaPath, "utf8");
  if (pgHbaIsHardened(current)) return;
  writePrivateFile(deps.hbaPath, Buffer.from(hardenPgHba(current), "utf8"));
  await session.query("SELECT pg_reload_conf()");
}

async function finish(deps: ExistingClusterDeps, session: PgSession, value: string): Promise<string> {
  try {
    await ensureHbaHardened(deps, session);
  } finally {
    await session.end();
  }
  return value;
}

/**
 * Existing cluster, already started: returns the credential that works now,
 * migrating a cluster still on the legacy login exactly once.
 *  a) .bin works            -> use it
 *  b) .tmp works            -> crash after ALTER ROLE, before rename: promote .tmp
 *  c) legacy login works    -> new value to .tmp, ALTER ROLE, reconnect with it, rename .tmp -> .bin
 * pg_hba.conf is rewritten to scram-sha-256 on every path (idempotent).
 */
export async function resolveExistingDbCredential(deps: ExistingClusterDeps): Promise<string> {
  const binFile = path.join(deps.dir, DB_CREDENTIAL_FILE);
  const tmpFile = path.join(deps.dir, DB_CREDENTIAL_TMP_FILE);

  const stored = readStoredCredential(binFile, deps);
  if (stored) {
    const session = await tryConnect(deps, stored);
    if (session) {
      fs.rmSync(tmpFile, { force: true });
      return finish(deps, session, stored);
    }
  }

  const staged = readStoredCredential(tmpFile, deps);
  if (staged) {
    const session = await tryConnect(deps, staged);
    if (session) {
      fs.renameSync(tmpFile, binFile);
      deps.warn("DB-Zugang: unterbrochene Umstellung abgeschlossen");
      return finish(deps, session, staged);
    }
  }

  const legacy = await tryConnect(deps, LEGACY_DB_PASSWORD);
  if (!legacy) {
    throw new Error(
      "Datenbank-Zugang passt nicht zum gespeicherten Schlüssel (db-credential.bin). Bitte Support kontaktieren.",
    );
  }

  const value = generateDbCredential();
  try {
    writeStoredCredential(tmpFile, value, deps);
    await legacy.query("SET password_encryption = 'scram-sha-256'");
    await legacy.query(alterRolePasswordSql(deps.user, value));
  } finally {
    await legacy.end();
  }

  const fresh = await tryConnect(deps, value);
  if (!fresh) {
    throw new Error("Datenbank-Zugang konnte nicht umgestellt werden (Neuanmeldung fehlgeschlagen).");
  }
  fs.renameSync(tmpFile, binFile);
  deps.warn("DB-Zugang: von Standard-Login auf geräteeigenen Schlüssel umgestellt");
  return finish(deps, fresh, value);
}
