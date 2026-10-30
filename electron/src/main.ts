import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import log from "electron-log";
import { startEmbeddedPostgres, RunningPostgres } from "./postgres";
import { runMigrations } from "./migrate";
import { seedCategoriesIfEmpty } from "./seed-categories";
import { startNextServer, RunningServer } from "./server";
import { loadConfig, saveConfig } from "./config";
import { initAutoUpdater } from "./updater";
import { prismaDir, resourcesRoot } from "./paths";
import { findFreePort } from "./find-free-port";
import * as backup from "./backup";
import { registerBackupIpc, restoreDirs } from "./backup-ipc";
import {
  R3_DO_NOT_CLOSE,
  R3_TITLE,
  REPUBLISH_FAILED,
  RESTORE_STEPS,
  restoreOutcome,
  restoreReport,
  stepStates,
  type RestoreAction,
} from "./restore-screens";
import { migrateClusterToUtf8, recoverEncodingMigration } from "./backup/encoding-migration";
import { embeddedClusterOps, embeddedPgCtlPath, pgEncodingChecks } from "./backup/encoding-cluster";
import {
  blockedDialog,
  encodingFailedDialog,
  migrateFailedDialog,
  quitWhileBackupDialog,
  restoreBlockQuitDialog,
  restoredWaitingDialog,
  waitingForFixDialog,
  type DialogSpec,
} from "./backup-dialogs";

let mainWindow: BrowserWindow | null = null;
let runningPostgres: RunningPostgres | null = null;
let runningServer: RunningServer | null = null;
let syncPollTimer: NodeJS.Timeout | null = null;
let backupRunner: backup.BackupRunner | null = null;
let backupTimer: NodeJS.Timeout | null = null;
// True from R3 until the R4 screen shows: window close and quit are blocked.
let restoring = false;

const SYNC_POLL_INTERVAL_MS = 60_000;
const BACKUP_TICK_INTERVAL_MS = 60 * 60 * 1000;
// embedded-postgres major; the bundled pg_dump must match (storage design 1).
const PG_MAJOR = 18;

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

// Ticket #1369: schiebt die Website-Sync-Outbox raus und holt neue
// Bestellungen - läuft hier im Electron-Hauptprozess (der die Lifecycle
// ohnehin besitzt, siehe waitForReady's eigenes Polling in server.ts), nicht
// im Next-Server selbst, damit ein Server-Neustart den Timer nicht verdoppelt.
function startSyncPoll(serverUrl: string): void {
  const poll = () => {
    fetch(`${serverUrl}/api/sync/drain`, { method: "POST" }).catch((error) => {
      log.error("[sync] background poll failed", error);
    });
  };
  poll();
  syncPollTimer = setInterval(poll, SYNC_POLL_INTERVAL_MS);
}

function stopSyncPoll(): void {
  if (syncPollTimer) {
    clearInterval(syncPollTimer);
    syncPollTimer = null;
  }
}

// After a restore the poll stays off until "Artikel neu senden" (files' UX R4a).
function startSyncPollUnlessPaused(serverUrl: string): void {
  const pausedSince = loadConfig().syncPausedAfterRestore;
  if (pausedSince) {
    log.info(`[sync] paused since the restore at ${pausedSince}`);
    return;
  }
  if (!syncPollTimer) startSyncPoll(serverUrl);
}

async function ask(spec: DialogSpec): Promise<number> {
  // noLink: keep real buttons on Windows instead of command links.
  return (await dialog.showMessageBox({ ...spec, noLink: true })).response;
}

// Stale image snapshots, and a pg_dump self-check whose result the
// Einstellungen block shows (files' UX 1.3 "broken tool").
async function prepareBackups(deps: backup.BackupDeps): Promise<void> {
  backup.pruneImageSnapshots(deps.imagesDir);
  backup.updateStatus(deps, { toolProblem: await backup.checkPgTools(deps.tools, PG_MAJOR) });
}

/**
 * migrate deploy only after a verified "Vor Update" backup (review must 10,
 * storage 3.3). Returns false when the app must not start Next: the native
 * dialogs from files' UX 3.1-3.3 have been shown by then.
 */
async function migrateWithBackupOrStop(deps: backup.BackupDeps, databaseUrl: string): Promise<boolean> {
  const migrationsDir = path.join(prismaDir(), "migrations");
  for (;;) {
    const outcome = await backup.migrateWithBackup(deps, { migrationsDir, runMigrations: () => runMigrations(databaseUrl) });
    log.info("[backup] migrate outcome", outcome.status);
    switch (outcome.status) {
      case "fresh":
      case "up-to-date":
      case "migrated":
        return true;
      case "blocked":
        if ((await ask(blockedDialog(outcome.reason))) === 0) continue;
        return false;
      case "waiting-for-fix":
        await ask(waitingForFixDialog());
        return false;
      case "migrate-failed": {
        log.error("[backup] migrate deploy failed", outcome.error);
        const manifest = backup.readManifest(outcome.backupDir);
        if ((await ask(migrateFailedDialog(manifest, new Date()))) !== 0 || !manifest) return false;
        // Next is not running yet, so there is nothing to stop. No runMigrations:
        // this version must not migrate again (storage 3.3.4).
        const result = await backup.restoreBackup(deps, outcome.backupDir, { stopApp: async () => {} });
        if (!result.ok) {
          log.error("[backup] restore of the pre-update backup failed", result);
          await ask(migrateFailedDialog(null, new Date()));
          return false;
        }
        backup.markWaitingForFix(deps);
        await ask(restoredWaitingDialog(result.manifest, new Date()));
        return false;
      }
    }
  }
}

// Hourly: a daily backup when the newest is >20 h old, then the second copy
// (catches up once the USB stick is back, files' UX 1.5).
function startBackupSchedule(deps: backup.BackupDeps, runner: backup.BackupRunner): void {
  const tick = async () => {
    await runner.runDailyIfDue();
    const folder = loadConfig().backupCopyFolder;
    if (!folder) return;
    const copy = await backup.syncNewestToTarget(deps, folder);
    if (copy && !copy.ok) log.warn("[backup] second copy failed", copy.error);
  };
  const safeTick = () => {
    tick().catch((err) => log.error("[backup] hourly tick failed", err));
  };
  safeTick();
  backupTimer = setInterval(safeTick, BACKUP_TICK_INTERVAL_MS);
}

function stopBackupSchedule(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

async function isSyncConfigured(serverUrl: string | undefined): Promise<boolean> {
  if (!serverUrl) return false;
  try {
    const res = await fetch(`${serverUrl}/api/sync/republish`);
    return res.ok && ((await res.json()) as { configured?: boolean }).configured === true;
  } catch {
    return false;
  }
}

/**
 * Einstellungen > Daten zurückholen, screens R3/R4 (files' UX #3067 section 2,
 * storage design 4). R1/R2 run in Next; from here the main window shows
 * restore.html, because the Next server is stopped while the database is swapped.
 */
function registerRestoreIpc(
  deps: backup.BackupDeps,
  runner: backup.BackupRunner,
  databaseUrl: string,
  offContactEmail: string,
): void {
  let answer: ((action: RestoreAction) => void) | null = null;
  let report = "";

  ipcMain.handle("restore:action", async (_event, action: RestoreAction) => {
    if (action === "copyReport") return clipboard.writeText(report);
    if (action === "openFolder") return void (await shell.openPath(deps.backupsRoot));
    answer?.(action);
  });

  ipcMain.handle("backup:restore", async (_event, id: string) => {
    const dir = restoreDirs.get(id);
    const manifest = dir ? backup.readManifest(dir) : null;
    const win = mainWindow;
    if (!dir || !manifest || !win || restoring || runner.busy) return;

    const blockClose = (event: Electron.Event) => {
      if (!restoring) return;
      event.preventDefault();
      void ask(restoreBlockQuitDialog());
    };
    const syncConfigured = await isSyncConfigured(runningServer?.url);
    restoring = true;
    win.on("close", blockClose);
    try {
      await win.loadFile(path.join(__dirname, "restore.html"));
      const send = (state: unknown) => win.webContents.send("restore:state", state);
      const progress = (step: backup.RestoreStep) => {
        const states = stepStates(step);
        send({
          phase: "progress",
          title: R3_TITLE,
          doNotClose: R3_DO_NOT_CLOSE,
          steps: RESTORE_STEPS.map((s) => ({ label: s.label, state: states[s.step] })),
        });
      };

      stopBackupSchedule();
      const result = await backup.restoreBackup(deps, dir, {
        stopApp: async () => {
          stopSyncPoll();
          const server = runningServer;
          runningServer = null;
          if (server) await server.stop();
        },
        runMigrations: () => runMigrations(databaseUrl),
        onStep: progress,
      });
      report = restoreReport(app.getVersion(), dir, result, new Date());
      if (result.ok) log.info(`[restore] done: ${dir}`);
      else log.error("[restore] failed", { step: result.step, error: result.error, rolledBack: result.rolledBack });

      const screen = restoreOutcome(result, manifest.createdAt, new Date(), syncConfigured);
      if (result.ok && syncConfigured) {
        saveConfig({ ...loadConfig(), syncPausedAfterRestore: new Date().toISOString() });
      }
      if (screen.startApp) {
        if (!runningServer) runningServer = await startNextServer(databaseUrl, offContactEmail);
        startSyncPollUnlessPaused(runningServer.url);
        startBackupSchedule(deps, runner);
      }
      restoring = false;
      send({ phase: "result", screen });
      // restore.fatal: Next stays stopped, only Ordner öffnen / Fehlerbericht work.
      if (!screen.startApp || !runningServer) return;

      for (;;) {
        const action = await new Promise<RestoreAction>((resolve) => (answer = resolve));
        if (action !== "republish") {
          await win.loadURL(`${runningServer.url}/settings${action === "chooseOther" ? "#zurueckholen" : ""}`);
          return;
        }
        try {
          const res = await fetch(`${runningServer.url}/api/sync/republish`, { method: "POST" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const config = loadConfig();
          delete config.syncPausedAfterRestore;
          saveConfig(config);
          startSyncPollUnlessPaused(runningServer.url);
          await win.loadURL(`${runningServer.url}/settings`);
          return;
        } catch (err) {
          log.error("[restore] republish failed", err);
          send({ phase: "result", screen, notice: REPUBLISH_FAILED });
        }
      }
    } catch (err) {
      log.error("[restore] unexpected failure", err);
      showFatalError(err);
    } finally {
      answer = null;
      restoring = false;
      win.removeListener("close", blockClose);
    }
  });
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
  const url = process.env.ASIA_SHOP_URL ?? "http://localhost:3000";
  await mainWindow.loadURL(url);
  startSyncPoll(url);
}

async function bootFullPipeline(): Promise<void> {
  const config = loadConfig();
  if (!config.offContactEmail) {
    config.offContactEmail = await promptForOffContactEmail();
    saveConfig(config);
  }

  const splash = createSplashWindow();

  try {
    const userDataDir = app.getPath("userData");
    const backupsRoot = path.join(userDataDir, "backups");
    const depsFor = (databaseUrl: string) =>
      backup.productionDeps({
        userDataDir,
        resourcesRoot: resourcesRoot(),
        isPackaged: app.isPackaged,
        appVersion: app.getVersion(),
        databaseUrl,
        log,
      });
    // Still look for a fixed release (files' UX 3.1). Keeping the updater
    // alive after this quit is a should-item (#3080).
    const stopBoot = () => {
      initAutoUpdater();
      splash.close();
      app.quit();
    };

    // Files only, before Postgres starts: crash leftovers of a backup or of
    // the encoding migration (storage #3112 wiring note, step 1).
    if (backup.removeInterruptedRuns(backupsRoot).length > 0) {
      backup.updateStatus({ backupsRoot }, { lastError: "interrupted" });
    }
    const recovery = recoverEncodingMigration({ userDataDir, backupsRoot, appVersion: app.getVersion(), log });
    if (recovery.status === "failed" || recovery.status === "unclear") {
      log.error("[encoding] refusing to start:", recovery.error);
      await ask(encodingFailedDialog());
      stopBoot();
      return;
    }

    runningPostgres = await startEmbeddedPostgres();
    let databaseUrl = runningPostgres.databaseUrl;
    let backupDeps = depsFor(databaseUrl);

    // Never start Next on a non-UTF8 cluster (review must 1, storage design 3.2).
    const { serverEncoding } = await backup.readServerInfo(backupDeps.conn);
    if (serverEncoding !== "UTF8") {
      log.info(`[encoding] cluster is ${serverEncoding}, migrating to UTF8`);
      const enc = await migrateClusterToUtf8({
        ...backupDeps,
        userDataDir,
        cluster: embeddedClusterOps({ pgCtlPath: embeddedPgCtlPath(__dirname), findFreePort, log }),
        checks: pgEncodingChecks,
      });
      // pg_ctl already stopped the old postmaster; stop() would taskkill a dead pid.
      if (enc.status === "migrated" || (enc.status === "failed" && enc.oldClusterStopped)) runningPostgres = null;
      if (enc.status === "failed") {
        log.error(`[encoding] ${enc.step}: ${enc.error}`);
        await ask(encodingFailedDialog());
        stopBoot();
        return;
      }
      if (enc.status === "migrated") {
        runningPostgres = await startEmbeddedPostgres();
        databaseUrl = runningPostgres.databaseUrl;
        backupDeps = depsFor(databaseUrl);
      }
    }

    await prepareBackups(backupDeps);
    if (!(await migrateWithBackupOrStop(backupDeps, databaseUrl))) {
      stopBoot();
      return;
    }
    await seedCategoriesIfEmpty(databaseUrl);
    runningServer = await startNextServer(databaseUrl, config.offContactEmail);

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      title: "Asia To Go",
      autoHideMenuBar: true,
      show: false,
      // backupApi for Einstellungen (files' UX 1.6).
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
    await mainWindow.loadURL(runningServer.url);
    mainWindow.show();
    splash.close();
    initAutoUpdater();
    startSyncPollUnlessPaused(runningServer.url);
    backupRunner = new backup.BackupRunner(backupDeps);
    startBackupSchedule(backupDeps, backupRunner);
    registerBackupIpc(backupDeps, backupRunner, userDataDir);
    registerRestoreIpc(backupDeps, backupRunner, databaseUrl, config.offContactEmail);
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
  if (restoring) {
    event.preventDefault();
    void ask(restoreBlockQuitDialog());
    return;
  }
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();

  stopSyncPoll();
  stopBackupSchedule();

  (async () => {
    // Before the force-exit timer: Papa may choose to wait for a running
    // backup (files' UX 1.4). Closing anyway leaves a .tmp-* folder that the
    // next start removes.
    if (backupRunner?.busy && (await ask(quitWhileBackupDialog())) === 0) {
      await backupRunner.waitIdle();
    }
    const forceExit = setTimeout(() => app.exit(), 5000);
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
