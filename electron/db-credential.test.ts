// Lives outside electron/src on purpose: electron/tsconfig.json compiles
// src/**/*.ts into the packaged app, and a test file has no business there.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DB_CREDENTIAL_FILE,
  DB_CREDENTIAL_TMP_FILE,
  LEGACY_DB_PASSWORD,
  alterRolePasswordSql,
  embeddedPostgresSecurityOptions,
  escapeLiteral,
  generateDbCredential,
  hardenPgHba,
  pgHbaIsHardened,
  prepareFreshDbCredential,
  readStoredCredential,
  resolveExistingDbCredential,
  withPrivateUmask,
  writeStoredCredential,
  type DbCredentialDeps,
  type ExistingClusterDeps,
  type SecretBox,
} from "./src/db-credential";

// What embedded-postgres' initdb (authMethod "password") left in old installs.
const LEGACY_HBA = [
  "# TYPE  DATABASE        USER            ADDRESS                 METHOD",
  "local   all             all                                     password",
  "host    all             all             127.0.0.1/32            password",
  "host    all             all             ::1/128                 password",
  "local   replication     all                                     password",
  "host    replication     all             127.0.0.1/32            password",
  "",
].join("\n");

function fakeSafeStorage(available = true): SecretBox & { failDecrypt: boolean } {
  return {
    failDecrypt: false,
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString("hex")}`),
    decryptString(b) {
      if (this.failDecrypt) throw new Error("DPAPI: key not found");
      const text = b.toString();
      if (!text.startsWith("enc:")) throw new Error("bad blob");
      return Buffer.from(text.slice(4), "hex").toString();
    },
  };
}

// Minimal stand-in for a running cluster: one role, one password, pg_hba on disk.
function fakeCluster(initialPassword: string) {
  const state = {
    password: initialPassword,
    queries: [] as string[],
    reloads: 0,
    failNextAlter: false,
  };
  const connect = async (password: string) => {
    if (password !== state.password) throw new Error('password authentication failed for user "asia_shop"');
    return {
      async query(sql: string) {
        state.queries.push(sql);
        if (sql === "SELECT pg_reload_conf()") state.reloads++;
        const m = /^ALTER ROLE "asia_shop" WITH PASSWORD '(.*)'$/.exec(sql);
        if (m) {
          if (state.failNextAlter) throw new Error("ALTER ROLE failed");
          state.password = m[1].replace(/''/g, "'");
        }
      },
      async end() {},
    };
  };
  return { state, connect };
}

let dir: string;
let warnings: string[];
let box: ReturnType<typeof fakeSafeStorage>;

function deps(): DbCredentialDeps {
  return { dir, safeStorage: box, warn: (m) => warnings.push(m) };
}

function existingDeps(cluster: ReturnType<typeof fakeCluster>): ExistingClusterDeps {
  return { ...deps(), user: "asia_shop", hbaPath: path.join(dir, "pg_hba.conf"), connect: cluster.connect };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbcred-"));
  fs.writeFileSync(path.join(dir, "pg_hba.conf"), LEGACY_HBA);
  warnings = [];
  box = fakeSafeStorage();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function filesIn(): string[] {
  return fs.readdirSync(dir).sort();
}

function expectNoLeak(value: string, extra: string[] = []) {
  for (const text of [...warnings, ...extra]) expect(text).not.toContain(value);
  for (const name of filesIn()) {
    expect(fs.readFileSync(path.join(dir, name)).toString("latin1")).not.toContain(value);
  }
}

describe("embeddedPostgresSecurityOptions", () => {
  it("asks for scram and a loopback-only listener", () => {
    expect(embeddedPostgresSecurityOptions()).toEqual({
      authMethod: "scram-sha-256",
      postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    });
  });
});

describe.skipIf(process.platform === "win32")("withPrivateUmask", () => {
  it("creates files 0600 inside, restores the umask after, also on a throw", async () => {
    const before = process.umask();
    const file = path.join(dir, "pg-password-x");
    await withPrivateUmask(async () => fs.writeFileSync(file, "v\n"));
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(process.umask()).toBe(before);
    await expect(withPrivateUmask(async () => Promise.reject(new Error("initdb failed")))).rejects.toThrow("initdb failed");
    expect(process.umask()).toBe(before);
  });
});

describe("generateDbCredential", () => {
  it("is 32 random bytes as base64url", () => {
    const a = generateDbCredential();
    const b = generateDbCredential();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });
});

describe("SQL escaping", () => {
  it("doubles quotes and switches to E'' for backslashes, like pg", () => {
    expect(escapeLiteral("a'b")).toBe("'a''b'");
    expect(escapeLiteral("a\\b")).toBe(" E'a\\\\b'");
  });

  it("builds ALTER ROLE with a quoted identifier and literal", () => {
    expect(alterRolePasswordSql('as"ia', "x'y")).toBe(`ALTER ROLE "as""ia" WITH PASSWORD 'x''y'`);
  });
});

describe("hardenPgHba", () => {
  it("turns every password/md5/trust line into scram-sha-256 and keeps comments", () => {
    const text = `${LEGACY_HBA}host all all 10.0.0.0/8 trust\nhost all all 0.0.0.0/0 md5 clientcert=verify-ca\n`;
    const out = hardenPgHba(text);
    const active = out.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    expect(active).toHaveLength(7);
    for (const line of active) {
      expect(line).toMatch(/scram-sha-256/);
      expect(line).not.toMatch(/\b(trust|password|md5)\b/);
    }
    expect(out).toContain("clientcert=verify-ca");
    expect(out.split("\n")[0]).toBe(LEGACY_HBA.split("\n")[0]);
    expect(pgHbaIsHardened(out)).toBe(true);
    expect(pgHbaIsHardened(LEGACY_HBA)).toBe(false);
  });

  it("leaves an already hardened file byte-identical", () => {
    const hardened = hardenPgHba(LEGACY_HBA);
    expect(hardenPgHba(hardened)).toBe(hardened);
  });
});

describe("stored credential file", () => {
  it("stores only the safeStorage blob, never the plain value", () => {
    const file = path.join(dir, DB_CREDENTIAL_FILE);
    writeStoredCredential(file, "s3cret-value", deps());
    const raw = fs.readFileSync(file);
    expect(raw[0]).toBe(0x01);
    expect(raw.toString("latin1")).not.toContain("s3cret-value");
    expect(readStoredCredential(file, deps())).toBe("s3cret-value");
    expect(filesIn()).not.toContain(`${DB_CREDENTIAL_FILE}.part`);
  });

  it("falls back to a plain user-only file with a warning when safeStorage is unavailable", () => {
    box = fakeSafeStorage(false);
    const file = path.join(dir, DB_CREDENTIAL_FILE);
    writeStoredCredential(file, "plain-value", deps());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("plain-value");
    expect(readStoredCredential(file, deps())).toBe("plain-value");
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("treats an undecryptable file as missing", () => {
    const file = path.join(dir, DB_CREDENTIAL_FILE);
    writeStoredCredential(file, "lost-value", deps());
    box.failDecrypt = true;
    expect(readStoredCredential(file, deps())).toBeNull();
    expect(warnings.join(" ")).toContain("nicht lesbar");
    expect(readStoredCredential(path.join(dir, "missing.bin"), deps())).toBeNull();
  });
});

describe("prepareFreshDbCredential", () => {
  it("generates and stores a value before initdb, then reuses it", () => {
    fs.writeFileSync(path.join(dir, DB_CREDENTIAL_TMP_FILE), "stale");
    const first = prepareFreshDbCredential(deps());
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(filesIn()).toContain(DB_CREDENTIAL_FILE);
    expect(filesIn()).not.toContain(DB_CREDENTIAL_TMP_FILE);
    // crash between this and initdb, or a cluster re-init: same value again
    expect(prepareFreshDbCredential(deps())).toBe(first);
    expectNoLeak(first);
  });
});

describe("resolveExistingDbCredential", () => {
  it("migrates a legacy cluster once: new value, old login refused, scram pg_hba, reload", async () => {
    const cluster = fakeCluster(LEGACY_DB_PASSWORD);
    const value = await resolveExistingDbCredential(existingDeps(cluster));

    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cluster.state.password).toBe(value);
    await expect(cluster.connect(LEGACY_DB_PASSWORD)).rejects.toThrow();
    expect(cluster.state.queries[0]).toBe("SET password_encryption = 'scram-sha-256'");
    expect(readStoredCredential(path.join(dir, DB_CREDENTIAL_FILE), deps())).toBe(value);
    expect(filesIn()).not.toContain(DB_CREDENTIAL_TMP_FILE);
    expect(pgHbaIsHardened(fs.readFileSync(path.join(dir, "pg_hba.conf"), "utf8"))).toBe(true);
    expect(cluster.state.reloads).toBe(1);
    expectNoLeak(value);
  });

  it("uses a working .bin without touching the role", async () => {
    writeStoredCredential(path.join(dir, DB_CREDENTIAL_FILE), "already-rotated", deps());
    fs.writeFileSync(path.join(dir, "pg_hba.conf"), hardenPgHba(LEGACY_HBA));
    const cluster = fakeCluster("already-rotated");
    expect(await resolveExistingDbCredential(existingDeps(cluster))).toBe("already-rotated");
    expect(cluster.state.queries).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("recovers a crash after ALTER ROLE and before the rename by promoting .tmp", async () => {
    writeStoredCredential(path.join(dir, DB_CREDENTIAL_TMP_FILE), "half-done", deps());
    const cluster = fakeCluster("half-done");
    expect(await resolveExistingDbCredential(existingDeps(cluster))).toBe("half-done");
    expect(cluster.state.queries.some((q) => q.startsWith("ALTER ROLE"))).toBe(false);
    expect(filesIn()).toContain(DB_CREDENTIAL_FILE);
    expect(filesIn()).not.toContain(DB_CREDENTIAL_TMP_FILE);
    expectNoLeak("half-done");
  });

  it("restarts the migration when the crash came before ALTER ROLE (.tmp never applied)", async () => {
    writeStoredCredential(path.join(dir, DB_CREDENTIAL_TMP_FILE), "never-applied", deps());
    const cluster = fakeCluster(LEGACY_DB_PASSWORD);
    const value = await resolveExistingDbCredential(existingDeps(cluster));
    expect(value).not.toBe("never-applied");
    expect(cluster.state.password).toBe(value);
    expect(readStoredCredential(path.join(dir, DB_CREDENTIAL_FILE), deps())).toBe(value);
  });

  it("keeps the legacy login and no .bin when ALTER ROLE fails", async () => {
    const cluster = fakeCluster(LEGACY_DB_PASSWORD);
    cluster.state.failNextAlter = true;
    await expect(resolveExistingDbCredential(existingDeps(cluster))).rejects.toThrow("ALTER ROLE failed");
    expect(cluster.state.password).toBe(LEGACY_DB_PASSWORD);
    expect(filesIn()).not.toContain(DB_CREDENTIAL_FILE);
    // next start simply retries
    cluster.state.failNextAlter = false;
    const value = await resolveExistingDbCredential(existingDeps(cluster));
    expect(cluster.state.password).toBe(value);
  });

  it("fails closed without leaking anything when no login works", async () => {
    writeStoredCredential(path.join(dir, DB_CREDENTIAL_FILE), "wrong-one", deps());
    const cluster = fakeCluster("someone-elses");
    const err = await resolveExistingDbCredential(existingDeps(cluster)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("db-credential.bin");
    expectNoLeak("wrong-one", [(err as Error).message]);
    expectNoLeak("someone-elses", [(err as Error).message]);
    expect(cluster.state.queries).toEqual([]);
  });
});
