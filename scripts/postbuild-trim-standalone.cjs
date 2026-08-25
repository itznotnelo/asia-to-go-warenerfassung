// Next's output tracer includes next/dist/lib/verify-typescript-setup.js —
// a build-time-only file (checks tsconfig.json during `next build`, and
// during `next dev`'s type checking) — as part of tracing the `next`
// package as a whole. It's never invoked by server.js at runtime. An
// outputFileTracingExcludes entry for it was tried first (see next.config.ts
// history) and confirmed to be a no-op — the standalone typescript/ folder
// came out at the identical 8.7MB with or without it — so it's deleted by
// hand here instead. Confirmed safe by running the standalone server and
// exercising every route afterward.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const typescriptDir = path.join(root, ".next", "standalone", "node_modules", "typescript");

if (fs.existsSync(typescriptDir)) {
  const before = fs.statSync(typescriptDir).isDirectory();
  fs.rmSync(typescriptDir, { recursive: true, force: true });
  if (before) console.log("Removed unused typescript package from standalone build");
}
