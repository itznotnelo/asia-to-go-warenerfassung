// tsc only compiles .ts files — non-TS assets electron/src needs at runtime
// (currently just splash.html) must be copied into electron/app by hand.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
fs.copyFileSync(
  path.join(root, "electron", "src", "splash.html"),
  path.join(root, "electron", "app", "splash.html"),
);
console.log("Copied electron/src/splash.html -> electron/app/splash.html");
