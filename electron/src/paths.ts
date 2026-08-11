import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

// In dev (electron:dev), __dirname is electron/app/ (tsc's outDir) and
// resources live two levels up at the repo root. In a packaged build,
// electron-builder's extraResources land directly under process.resourcesPath
// as siblings of the app bundle (resources/app/ is __dirname there).
function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "..");
}

export function standaloneDir(): string {
  return app.isPackaged
    ? path.join(resourcesRoot(), "standalone")
    : path.join(resourcesRoot(), ".next", "standalone");
}

export function prismaDir(): string {
  return path.join(resourcesRoot(), "prisma");
}

export function prismaConfigPath(): string {
  return path.join(prismaDir(), "electron.config.ts");
}

// electron/app's own local `prisma` install — same relative location
// (<app root>/node_modules/prisma) in both dev and packaged mode, since
// electron-builder bundles electron/app/node_modules wholesale.
export function prismaCliPath(): string {
  return path.join(__dirname, "node_modules", "prisma", "build", "index.js");
}

// CI prefetches the platform-specific Prisma schema-engine binary and bundles
// it here (see .github/workflows/release.yml) so `migrate deploy` never needs
// network access on a fresh end-user machine. Falls back to undefined
// locally, where Prisma resolves/downloads it via its own global cache —
// fine for dev, since a real machine always has internet on first use there.
export function bundledSchemaEngineBinaryPath(): string | undefined {
  // scripts/ci-prefetch-prisma-engine.cjs bundles this as schema-engine.exe
  // on Windows (Prisma's own cached copy has no extension, but Windows
  // fails to execute it from outside Prisma's own cache dir without one).
  const name = process.platform === "win32" ? "schema-engine.exe" : "schema-engine";
  const candidate = path.join(resourcesRoot(), "prisma-engines", name);
  return fs.existsSync(candidate) ? candidate : undefined;
}

export function pgDataDir(): string {
  return path.join(app.getPath("userData"), "pgdata");
}

export function imageDir(): string {
  return path.join(app.getPath("userData"), "images");
}
