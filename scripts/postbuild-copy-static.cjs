// .next/standalone output does NOT include .next/static or public/ — Next's own
// docs require copying these in by hand. These are project-owned directories
// (not pnpm-linked node_modules), so a plain recursive copy is sufficient.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(root, ".next", "standalone", ".next", "static"),
  { recursive: true },
);
fs.cpSync(path.join(root, "public"), path.join(root, ".next", "standalone", "public"), {
  recursive: true,
});

console.log("Copied .next/static and public/ into .next/standalone/");
