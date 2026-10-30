import { execFile } from "node:child_process";
import path from "node:path";
import { BackupError, PgConnection, PgTools } from "./types";

// pg_dump / pg_restore 18.x from the EDB Windows zip, shipped by
// electron-builder as extraResources "pg-tools/" (design section 1).
// embedded-postgres' own native/bin has no client tools.

export type PgToolName = "pg_dump" | "pg_restore";

// resourcesRoot = process.resourcesPath when packaged. In dev, ATG_PG_TOOLS_DIR
// may point at a local PG 18 bin dir; otherwise the binary is taken from PATH.
export function pgToolPath(tool: PgToolName, resourcesRoot: string, isPackaged: boolean): string {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  if (isPackaged) return path.join(resourcesRoot, "pg-tools", exe);
  const devDir = process.env.ATG_PG_TOOLS_DIR;
  return devDir ? path.join(devDir, exe) : tool;
}

const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";

interface ExecResult {
  stdout: string;
  stderr: string;
}

function run(bin: string, args: string[], password?: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        // Password via env only, never on the command line.
        env: { ...process.env, ...(password !== undefined ? { PGPASSWORD: password } : {}) },
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout, stderr });
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EACCES") {
          return reject(new BackupError("toolMissing", `${path.basename(bin)} not runnable: ${err.message}`));
        }
        if (/No space left on device|ENOSPC|not enough space/i.test(stderr)) {
          return reject(new BackupError("diskFull", `${path.basename(bin)}: ${stderr.trim()}`));
        }
        reject(new Error(`${path.basename(bin)} failed (${err.message}): ${stderr.trim()}`));
      },
    );
  });
}

function connArgs(conn: PgConnection): string[] {
  return ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database];
}

// "1234; 0 16390 TABLE DATA public Product asia_shop" -> "Product"
const TABLE_DATA_LINE = /^\d+;\s+\d+\s+\d+\s+TABLE DATA\s+public\s+(\S+)\s/;

export function parseTableDataEntries(listOutput: string): string[] {
  const names: string[] = [];
  for (const line of listOutput.split(/\r?\n/)) {
    const m = TABLE_DATA_LINE.exec(line);
    if (m) names.push(m[1].replace(/^"(.*)"$/, "$1"));
  }
  return names;
}

export function createPgTools(resolve: (tool: PgToolName) => string): PgTools {
  return {
    async version(tool) {
      const { stdout } = await run(resolve(tool), ["--version"]);
      return stdout.trim();
    },
    async dump(conn, file, opts) {
      const snapshot = opts?.snapshot ? [`--snapshot=${opts.snapshot}`] : [];
      await run(
        resolve("pg_dump"),
        [...connArgs(conn), "-Fc", "--no-owner", "--no-acl", ...snapshot, "-f", file],
        conn.password,
      );
    },
    async listTableData(file) {
      const { stdout } = await run(resolve("pg_restore"), ["--list", file]);
      return parseTableDataEntries(stdout);
    },
    async fullRead(file) {
      await run(resolve("pg_restore"), ["-f", NULL_DEVICE, file]);
    },
    async restore(conn, file) {
      await run(
        resolve("pg_restore"),
        [...connArgs(conn), "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", file],
        conn.password,
      );
    },
  };
}

// Startup self-check (design 1): pg_dump and pg_restore must report the
// same major as the bundled server. Returns null when fine, else the problem.
export async function checkPgTools(tools: PgTools, serverMajor: number): Promise<string | null> {
  for (const tool of ["pg_dump", "pg_restore"] as const) {
    try {
      const v = await tools.version(tool);
      const m = /\(PostgreSQL\)\s+(\d+)/.exec(v);
      if (!m || Number(m[1]) !== serverMajor) return `${tool} reports "${v}", expected major ${serverMajor}`;
    } catch (err) {
      return `${tool}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}
