import { fork, ChildProcess } from "node:child_process";
import path from "node:path";
import log from "electron-log";
import { standaloneDir, imageDir } from "./paths";
import { findFreePort } from "./find-free-port";

export interface RunningServer {
  url: string;
  stop(): Promise<void>;
}

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server did not become ready within ${timeoutMs}ms: ${String(lastError)}`);
}

// HOSTNAME=127.0.0.1 (loopback only) avoids an unnecessary Windows Firewall
// prompt for what's a single-user local app — this never needs to be
// reachable from other machines.
export async function startNextServer(databaseUrl: string): Promise<RunningServer> {
  const port = await findFreePort();
  const cwd = standaloneDir();
  const serverEntry = path.join(cwd, "server.js");

  const child: ChildProcess = fork(serverEntry, [], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      IMAGE_ROOT: imageDir(),
      NODE_ENV: "production",
    },
    silent: true,
  });

  child.stdout?.on("data", (chunk: Buffer) => log.info("[next]", chunk.toString().trim()));
  child.stderr?.on("data", (chunk: Buffer) => log.error("[next]", chunk.toString().trim()));
  child.on("error", (err) => log.error("[next] failed to start", err));

  const url = `http://127.0.0.1:${port}`;
  await waitForReady(url, 30_000);

  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        const forceTimeout = setTimeout(resolve, 5000);
        child.once("exit", () => {
          clearTimeout(forceTimeout);
          resolve();
        });
        child.kill();
      }),
  };
}
