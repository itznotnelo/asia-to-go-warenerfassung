import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import log from "electron-log";
import { startEmbeddedPostgres, RunningPostgres } from "./postgres";
import { runMigrations } from "./migrate";
import { seedCategoriesIfEmpty } from "./seed-categories";
import { startNextServer, RunningServer } from "./server";
import { loadConfig, saveConfig } from "./config";
import { initAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let runningPostgres: RunningPostgres | null = null;
let runningServer: RunningServer | null = null;

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    title: "Asia To Go",
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, "splash.html"));
  return win;
}

// Open Food Facts requires a real, reachable contact address per install
// (their abuse-contact policy) — there's no safe generic default, since
// every download of this app would otherwise send the same address. Shown
// once on first run; the answer is saved to userData/config.json.
function promptForOffContactEmail(): Promise<string> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 340,
      frame: false,
      resizable: false,
      title: "Asia To Go — Einrichtung",
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
    win.loadFile(path.join(__dirname, "setup-prompt.html"));

    ipcMain.handleOnce("setup:submit", (_event, email: string) => {
      win.close();
      resolve(email);
    });
  });
}

function showFatalError(err: unknown): void {
  const win = new BrowserWindow({ width: 640, height: 360, autoHideMenuBar: true });
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<body style="font-family:sans-serif;background:#1c1a17;color:#f2ede4;padding:1.5rem">` +
        `<h2>Asia To Go konnte nicht gestartet werden</h2>` +
        `<pre style="white-space:pre-wrap;font-size:0.8rem">${message}</pre>` +
        `</body>`,
    )}`,
  );
}

// Fast dev-mode path: point at whatever's already serving the app (pnpm dev,
// or pnpm start against the Docker Postgres) instead of spinning up embedded
// Postgres + the standalone build every iteration. Set
// ASIA_SHOP_FORCE_FULL_BOOT=1 to exercise the real packaged-app boot path
// from source (requires `pnpm build` to have produced .next/standalone).
function shouldUseFullBootPipeline(): boolean {
  return app.isPackaged || process.env.ASIA_SHOP_FORCE_FULL_BOOT === "1";
}

async function bootDevMode(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Asia To Go",
    autoHideMenuBar: true,
  });
  await mainWindow.loadURL(process.env.ASIA_SHOP_URL ?? "http://localhost:3000");
}

async function bootFullPipeline(): Promise<void> {
  const config = loadConfig();
  if (!config.offContactEmail) {
    config.offContactEmail = await promptForOffContactEmail();
    saveConfig(config);
  }

  const splash = createSplashWindow();

  try {
    runningPostgres = await startEmbeddedPostgres();
    await runMigrations(runningPostgres.databaseUrl);
    await seedCategoriesIfEmpty(runningPostgres.databaseUrl);
    runningServer = await startNextServer(runningPostgres.databaseUrl, config.offContactEmail);

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      title: "Asia To Go",
      autoHideMenuBar: true,
      show: false,
    });
    await mainWindow.loadURL(runningServer.url);
    mainWindow.show();
    splash.close();
    initAutoUpdater();
  } catch (err) {
    log.error("Failed to start Asia To Go", err);
    splash.close();
    showFatalError(err);
  }
}

app.whenReady().then(() => {
  const boot = shouldUseFullBootPipeline() ? bootFullPipeline : bootDevMode;
  boot();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let shuttingDown = false;

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();

  const forceExit = setTimeout(() => app.exit(), 5000);

  (async () => {
    try {
      if (runningServer) await runningServer.stop();
      if (runningPostgres) await runningPostgres.stop();
    } catch (err) {
      log.error("Error during shutdown", err);
    } finally {
      clearTimeout(forceExit);
      app.exit();
    }
  })();
});
