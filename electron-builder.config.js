const fs = require("node:fs");
const path = require("node:path");

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "ch.planimpuls.asia-to-go",
  productName: "Asia To Go",
  directories: {
    app: "electron/app",
    output: "electron/release",
  },
  asar: false,
  compression: "maximum",
  // Electron bundles ~55 Chromium UI locale files (spellcheck, context
  // menus, etc.) by default — the app itself is German-only, so keep just
  // German plus an English fallback rather than shipping all of them.
  electronLanguages: ["de", "en-US"],
  extraResources: [
    {
      from: "prisma",
      to: "prisma",
      filter: ["schema.prisma", "electron.config.ts", "migrations/**"],
    },
  ],
  // electron-builder's extraResources file matcher silently drops any
  // directory literally named node_modules, no matter the filter — so
  // .next/standalone (which has its own self-contained node_modules from
  // scripts/postbuild-copy-natives.cjs) is copied by hand here instead,
  // after electron-builder has finished its own packaging.
  afterPack: async (context) => {
    const standaloneDest = path.join(context.appOutDir, "resources", "standalone");
    fs.rmSync(standaloneDest, { recursive: true, force: true });
    fs.cpSync(path.join(__dirname, ".next", "standalone"), standaloneDest, { recursive: true });
    console.log(`Copied .next/standalone -> ${standaloneDest}`);

    // CI-only: electron/resources/prisma-engines/ is populated by the release
    // workflow's prefetch step (see .github/workflows/release.yml) and is
    // absent for a plain local build — migrate.ts falls back gracefully when
    // this directory doesn't exist in the packaged app.
    const engineSrc = path.join(__dirname, "electron", "resources", "prisma-engines");
    if (fs.existsSync(engineSrc)) {
      const engineDest = path.join(context.appOutDir, "resources", "prisma-engines");
      fs.cpSync(engineSrc, engineDest, { recursive: true });
      console.log(`Copied prisma-engines -> ${engineDest}`);
    }
  },
  win: {
    target: "nsis",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
};
