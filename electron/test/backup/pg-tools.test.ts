import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgTools } from "../../src/backup/pg-tools";

// vi.mock is hoisted above the imports, so the call log must be too.
const calls = vi.hoisted(() => [] as { bin: string; args: string[]; env: NodeJS.ProcessEnv }[]);

vi.mock("node:child_process", () => ({
  execFile: (
    bin: string,
    args: string[],
    opts: { env: NodeJS.ProcessEnv },
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    calls.push({ bin, args, env: opts.env });
    cb(null, "", "");
  },
}));

const conn = { host: "127.0.0.1", port: 55432, user: "asia_shop", password: "secret", database: "asia_shop" };

describe("pg_dump arguments", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("passes --snapshot so pg_dump reads the counted snapshot (#3111)", async () => {
    const tools = createPgTools((t) => `/pg/${t}`);
    await tools.dump(conn, "/b/db.dump", { snapshot: "00000003-0000001B-1" });
    expect(calls[0].bin).toBe("/pg/pg_dump");
    expect(calls[0].args).toContain("--snapshot=00000003-0000001B-1");
    expect(calls[0].args.slice(-2)).toEqual(["-f", "/b/db.dump"]);
    // Password via env only.
    expect(calls[0].args.join(" ")).not.toContain("secret");
    expect(calls[0].env.PGPASSWORD).toBe("secret");
  });

  it("no snapshot: plain dump (WIN1252 migration with stopped writers)", async () => {
    const tools = createPgTools((t) => `/pg/${t}`);
    await tools.dump(conn, "/b/db.dump");
    expect(calls[0].args.some((a) => a.startsWith("--snapshot"))).toBe(false);
  });
});
