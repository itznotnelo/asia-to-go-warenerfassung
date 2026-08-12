// electron/app only ever shells out to `prisma migrate deploy`, which talks
// to Postgres through the native schema-engine.exe binary (bundled
// separately), never through JS-level DB drivers — but the `prisma` npm
// package's own dependencies pull in an unused MySQL driver and an unused
// alternate Postgres driver ("postgres", aka postgres.js — this app uses
// `pg` + @prisma/adapter-pg instead). Deleting them is verified safe by
// re-running the full packaged-app test (migrate + seed + every route)
// after this step.
//
// NOTE: @prisma/studio-core (Prisma Studio's web GUI) and @prisma/dev
// (Prisma's own competing local-Postgres feature, built on
// @electric-sql/pglite) can NOT be removed, even though this app never runs
// `prisma studio` or `prisma dev` — together with their own transitive
// deps (@visx, @radix-ui, elkjs, d3-array, d3-shape, @electric-sql,
// @prisma/query-plan-executor, @prisma/streams-local, find-my-way,
// foreground-child, get-port-please, pathe, proper-lockfile, remeda,
// std-env, valibot, zeptomatch — ~150MB combined) they were removed and
// tested first, and both broke `migrate deploy` with MODULE_NOT_FOUND.
// Confirmed by direct testing: prisma's CLI eagerly requires
// '@prisma/studio-core/data/bff' and '@prisma/dev/internal/state' inside
// the migrate deploy code path specifically when process.versions.electron
// is set (i.e. when invoked via Electron's own Node binary, even under
// ELECTRON_RUN_AS_NODE) — a plain `node` invocation of the identical
// command doesn't hit this at all, which is what made both look safe to
// remove until testing the actual packaged app surfaced the crash.
const fs = require("node:fs");
const path = require("node:path");

const modulesDir = path.join(__dirname, "..", "electron", "app", "node_modules");

const toRemove = [
  // Unused DB drivers — migrate deploy talks to Postgres via the native
  // schema-engine binary, not these
  "mysql2",
  "postgres",
];

let removedBytes = 0;
function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

for (const name of toRemove) {
  const dir = path.join(modulesDir, name);
  if (!fs.existsSync(dir)) continue;
  removedBytes += dirSize(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${name}`);
}

console.log(`Trimmed ${(removedBytes / 1024 / 1024).toFixed(0)} MB from electron/app/node_modules`);
