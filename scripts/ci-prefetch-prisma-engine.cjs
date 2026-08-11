// CI-only: downloads Prisma's platform-specific schema-engine binary
// directly (no live database needed — GitHub's windows-latest runners run
// as an admin-privileged account that embedded Postgres refuses to start
// under, so spinning up a throwaway instance here isn't an option) and
// copies it into electron/resources/prisma-engines/ for
// electron-builder.config.js's afterPack hook to bundle into the installer.
// Without this, the packaged app would need network access on a fresh
// end-user machine just to run its first migration. Never commit the
// copied binary; it's regenerated fresh on every release build so it can't
// silently drift from a future @prisma/engines-version bump.
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const electronAppModules = path.join(root, "electron", "app", "node_modules");

const { download, BinaryType } = require(path.join(electronAppModules, "@prisma", "fetch-engine"));
const { enginesVersion } = require(path.join(electronAppModules, "@prisma", "engines-version"));

async function main() {
  const destDir = path.join(root, "electron", "resources", "prisma-engines");
  fs.mkdirSync(destDir, { recursive: true });

  console.log(`Downloading schema-engine (${enginesVersion})...`);
  const binaryPaths = await download({
    binaries: { [BinaryType.SchemaEngineBinary]: destDir },
    version: enginesVersion,
  });

  const downloadedPath = Object.values(binaryPaths[BinaryType.SchemaEngineBinary] ?? {})[0];
  if (!downloadedPath) throw new Error("download() did not return a schema-engine path");

  // Windows needs the .exe extension to execute a binary from outside
  // Prisma's own cache dir (confirmed empirically — without it, spawning
  // produces a garbled OS-locale "could not be started" error instead of
  // the engine's JSON-RPC output).
  const destName = process.platform === "win32" ? "schema-engine.exe" : "schema-engine";
  const destPath = path.join(destDir, destName);
  if (downloadedPath !== destPath) {
    fs.renameSync(downloadedPath, destPath);
  }
  if (process.platform !== "win32") fs.chmodSync(destPath, 0o755);

  console.log(`Bundled schema-engine binary -> ${destPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
