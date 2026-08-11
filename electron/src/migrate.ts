import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { bundledSchemaEngineBinaryPath, prismaCliPath, prismaConfigPath } from "./paths";

const execFileAsync = promisify(execFile);

export async function runMigrations(databaseUrl: string): Promise<void> {
  log.info("Running prisma migrate deploy...");
  try {
    const schemaEngineBinary = bundledSchemaEngineBinaryPath();
    if (schemaEngineBinary) log.info("Using bundled schema-engine binary:", schemaEngineBinary);

    // process.execPath inside Electron's main process is the Electron binary,
    // not plain node — child_process.fork() gets ELECTRON_RUN_AS_NODE set
    // automatically, but execFile does not, so it must be set by hand or
    // this silently launches another Electron instance instead of running
    // the script.
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [prismaCliPath(), "migrate", "deploy", "--config", prismaConfigPath()],
      {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          ELECTRON_RUN_AS_NODE: "1",
          ...(schemaEngineBinary ? { PRISMA_SCHEMA_ENGINE_BINARY: schemaEngineBinary } : {}),
        },
      },
    );
    if (stdout) log.info(stdout);
    if (stderr) log.warn(stderr);
  } catch (err) {
    log.error("prisma migrate deploy failed", err);
    throw err;
  }
}
