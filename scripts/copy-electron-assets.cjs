// tsc only compiles .ts files — non-TS assets electron/src needs at runtime
// (splash.html, setup-prompt.html) must be copied into electron/app by hand.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "electron", "src");
const destDir = path.join(root, "electron", "app");

for (const name of ["splash.html", "setup-prompt.html"]) {
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  console.log(`Copied electron/src/${name} -> electron/app/${name}`);
}
