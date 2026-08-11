// CI-only: forces Prisma's schema-engine binary to download by running a
// real `migrate deploy` against a throwaway embedded Postgres instance, then
// copies the cached binary into electron/resources/prisma-engines/ for
// electron-builder.config.js's afterPack hook to bundle into the installer.
// This also doubles as a smoke test — a broken migration fails the release
// build here, before anything ships. Never commit the copied binary; it's
// regenerated fresh on every release build so it can't silently drift from
// a future @prisma/engines version bump.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

function prismaCacheRoot() {
  if (process.platform === "win32") return path.join(process.env.APPDATA, "Prisma");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "prisma");
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "prisma");
}

async function main() {
  // Requiring the package directory directly (rather than a bare specifier
  // resolved via node_modules walking) bypasses package.json "exports"
  // resolution, and this package has no "main" field — so the concrete
  // dist file must be named explicitly.
  const EmbeddedPostgres = require(
    path.join(root, "electron", "app", "node_modules", "embedded-postgres", "dist", "index.js"),
  ).default;

  const dataDir = path.join(os.tmpdir(), "asia-to-go-ci-pgdata");
  fs.rmSync(dataDir, { recursive: true, force: true });

  const port = 55432;
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "asia_shop",
    password: "asia_shop",
    persistent: false,
    onLog: (msg) => console.log("[pg]", msg),
    onError: (msg) => console.error("[pg:err]", msg),
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("asia_shop");

  const databaseUrl = `postgresql://asia_shop:asia_shop@127.0.0.1:${port}/asia_shop?schema=public`;
  const prismaCli = path.join(root, "electron", "app", "node_modules", "prisma", "build", "index.js");
  const configPath = path.join(root, "prisma", "electron.config.ts");

  console.log("Running migrate deploy to force the schema-engine binary to download...");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--config", configPath], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  await pg.stop();

  // Prisma's cached binary is literally named "schema-engine" with no
  // extension, even on Windows — but Windows fails to execute it from
  // outside Prisma's own cache dir unless we add the .exe extension back
  // when bundling it (confirmed: bundling without it produced a garbled
  // "could not be started" OS error instead of the engine's JSON-RPC output).
  const found = findFile(prismaCacheRoot(), "schema-engine");
  if (!found) throw new Error(`Could not find schema-engine under ${prismaCacheRoot()}`);

  const destName = process.platform === "win32" ? "schema-engine.exe" : "schema-engine";
  const destDir = path.join(root, "electron", "resources", "prisma-engines");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(found, path.join(destDir, destName));
  if (process.platform !== "win32") fs.chmodSync(path.join(destDir, destName), 0o755);
  console.log(`Bundled schema-engine binary: ${found} -> ${path.join(destDir, destName)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
