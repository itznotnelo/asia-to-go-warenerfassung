import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import log from "electron-log";
import { startEmbeddedPostgres, RunningPostgres } from "./postgres";
import { runMigrations } from "./migrate";
import { seedMissingCategories } from "./seed-categories";
import { startNextServer, RunningServer } from "./server";
import { loadConfig, saveConfig } from "./config";
import { initAutoUpdater, installUpdateInsteadOfQuit, markBootDone } from "./updater";
import {
  createErrorThrottle,
  crashDecision,
  fatalActionFromUrl,
  fatalScreenHtml,
  isRealLoadFailure,
  parseCrashRelaunches,
  relaunchArgs,
  watchLiveness,
  type FatalKind,
} from "./app-health";
import { PG_STOP_TIMEOUT_MS } from "./postgres";
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
import { embeddedPostgresSecurityOptions } from "./db-credential";
import { applyWindowSecurity, secureWebPreferences } from "./window-security";
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
let shuttingDown = false;
let fatalWindow: BrowserWindow | null = null;
let stopPostgresWatch: (() => void) | null = null;
const startedAt = Date.now();

// The default 1 MB rotated away the first failure before anyone looked.
log.transports.file.maxSize = 10 * 1024 * 1024;

const SYNC_POLL_INTERVAL_MS = 60_000;
const SYNC_ERROR_LOG_WINDOW_MS = 30 * 60 * 1000;
const POSTGRES_WATCH_INTERVAL_MS = 15_000;
// Next stop (up to 5 s) + pg_ctl stop budget + margin (review should 21).
const FORCE_EXIT_MS = 5_000 + PG_STOP_TIMEOUT_MS + 5_000;
// A failed boot waits this long for a fixed release to download (should 22).
const FAILED_BOOT_UPDATE_WAIT_MS = 10 * 60 * 1000;
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
    webPreferences: secureWebPreferences(),
  });
  applyWindowSecurity(win);
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
      webPreferences: secureWebPreferences({ preload: path.join(__dirname, "preload.js") }),
    });
    applyWindowSecurity(win);
    win.loadFile(path.join(__dirname, "setup-prompt.html"));

    ipcMain.handleOnce("setup:submit", (_event, email: string) => {
      win.close();
      resolve(email);
    });
  });
}

// German, escaped, stack behind <details> (review should 21). The two buttons
// are links that will-navigate turns into actions.
function showFatalError(err: unknown, kind: FatalKind = "boot"): void {
  if (fatalWindow && !fatalWindow.isDestroyed()) {
    fatalWindow.focus();
    return;
  }
  const logPath = log.transports.file.getFile().path;
  const win = new BrowserWindow({
    width: 680,
    height: 460,
    autoHideMenuBar: true,
    title: "Asia To Go",
    webPreferences: secureWebPreferences(),
  });
  fatalWindow = win;
  win.on("closed", () => (fatalWindow = null));
  // Blocks every navigation; the listener below turns the two links into actions.
  applyWindowSecurity(win);
  win.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    const action = fatalActionFromUrl(url);
    if (action === "openLog") shell.showItemInFolder(logPath);
    if (action === "restart") {
      // A manual restart gets a fresh crash budget.
      app.relaunch({ args: relaunchArgs(process.argv.slice(1), 0) });
      app.quit();
    }
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fatalScreenHtml({ kind, error: err, logPath }))}`);
}

// Next or Postgres died after boot (review should 24): relaunch the whole app,
// since every start picks new ports; after MAX_CRASH_RELAUNCHES in a row,
// show the fatal screen instead of looping.
function onRuntimeFailure(what: string, err: unknown): void {
  if (shuttingDown || restoring) return;
  log.error(`[watch] ${what}`, err);
  const decision = crashDecision({
    relaunchesSoFar: parseCrashRelaunches(process.argv),
    uptimeMs: Date.now() - startedAt,
  });
  if (decision.action === "relaunch") {
    log.warn(`[watch] relaunching the app (${decision.count} in a row)`);
    app.relaunch({ args: relaunchArgs(process.argv.slice(1), decision.count) });
    app.quit();
    return;
  }
  showFatalError(err, "runtime");
}

// Ticket #1369: schiebt die Website-Sync-Outbox raus und holt neue
// Bestellungen - läuft hier im Electron-Hauptprozess (der die Lifecycle
// ohnehin besitzt, siehe waitForReady's eigenes Polling in server.ts), nicht
// im Next-Server selbst, damit ein Server-Neustart den Timer nicht verdoppelt.
function startSyncPoll(serverUrl: string): void {
  // Offline, every pass fails: one line per window, not one per minute.
  const errors = createErrorThrottle(SYNC_ERROR_LOG_WINDOW_MS);
  const poll = () => {
    fetch(`${serverUrl}/api/sync/drain`, { method: "POST" }).then(
      () => {
        if (errors.success()) log.info("[sync] background poll works again");
      },
      (error) => {
        const skipped = errors.failure();
        if (skipped === null) return;
        log.error(`[sync] background poll failed${skipped ? ` (${skipped} more since the last line)` : ""}`, error);
      },
    );
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

  // Full re-publish, then the poll may run again. Only a working send lifts the pause.
  const republish = async (): Promise<boolean> => {
    if (!runningServer) return false;
    try {
      const res = await fetch(`${runningServer.url}/api/sync/republish`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      log.error("[restore] republish failed", err);
      return false;
    }
    const config = loadConfig();
    delete config.syncPausedAfterRestore;
    saveConfig(config);
    startSyncPollUnlessPaused(runningServer.url);
    return true;
  };

  // sync.pausedAfterRestore box: [Jetzt neu senden].
  ipcMain.handle("backup:resumeSync", async () => ({ ok: await republish() }));

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
        if (!runningServer) runningServer = await startNextServer(databaseUrl, offContactEmail, onNextExit);
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
        if (await republish()) {
          await win.loadURL(`${runningServer.url}/settings`);
          return;
        }
        send({ phase: "result", screen, notice: REPUBLISH_FAILED });
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
    webPreferences: secureWebPreferences(),
  });
  const url = process.env.ASIA_SHOP_URL ?? "http://localhost:3000";
  applyWindowSecurity(mainWindow, url);
  await mainWindow.loadURL(url);
  startSyncPoll(url);
}

function onNextExit(code: number | null, signal: NodeJS.Signals | null): void {
  onRuntimeFailure("Next server stopped unexpectedly", new Error(`Next server exited (code ${code}, signal ${signal})`));
}

async function bootFullPipeline(): Promise<void> {
  // First, before anything that can fail: a release that can't boot must
  // still be able to fetch its fix (review should 22).
  initAutoUpdater();
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
    // Still look for a fixed release (files' UX 3.1, review should 22): if
    // one is out, the splash says so and it installs instead of the quit.
    const stopBoot = async () => {
      const installing = await installUpdateInsteadOfQuit(() => {
        void splash.webContents.executeJavaScript(
          `document.querySelector("h1").textContent = "Neue Version wird geladen…";` +
            `document.querySelector("p").textContent = "Bitte warten. Asia To Go startet danach von selbst neu.";`,
        );
      }, FAILED_BOOT_UPDATE_WAIT_MS);
      if (installing) return;
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
      await stopBoot();
      return;
    }

    runningPostgres = await startEmbeddedPostgres();
    let databaseUrl = runningPostgres.databaseUrl;
    let backupDeps = depsFor(databaseUrl);

    // Never start Next on a non-UTF8 cluster (review must 1, storage design 3.2).
    const { serverEncoding } = await backup.readServerInfo(backupDeps.conn);
    if (serverEncoding !== "UTF8") {
      log.info(`[encoding] cluster is ${serverEncoding}, migrating to UTF8`);
      // The backup inside already runs on the per-install credential (#3113,
      // resolved in startEmbeddedPostgres). The new cluster gets the same value,
      // scram-sha-256 and a loopback-only listener, so db-credential.bin stays
      // valid after the dir swap.
      const enc = await migrateClusterToUtf8({
        ...backupDeps,
        userDataDir,
        cluster: embeddedClusterOps({
          pgCtlPath: embeddedPgCtlPath(__dirname),
          findFreePort,
          log,
          ...embeddedPostgresSecurityOptions(),
        }),
        checks: pgEncodingChecks,
        newLogin: runningPostgres.login,
      });
      // pg_ctl already stopped the old postmaster; stop() would taskkill a dead pid.
      if (enc.status === "migrated" || (enc.status === "failed" && enc.oldClusterStopped)) runningPostgres = null;
      if (enc.status === "failed") {
        log.error(`[encoding] ${enc.step}: ${enc.error}`);
        await ask(encodingFailedDialog());
        await stopBoot();
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
      await stopBoot();
      return;
    }
    await seedMissingCategories(databaseUrl);
    runningServer = await startNextServer(databaseUrl, config.offContactEmail, onNextExit);

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      title: "Asia To Go",
      autoHideMenuBar: true,
      show: false,
      // backupApi for Einstellungen (files' UX 1.6).
      webPreferences: secureWebPreferences({ preload: path.join(__dirname, "preload.js") }),
    });
    applyWindowSecurity(mainWindow, () => runningServer?.url);
    await mainWindow.loadURL(runningServer.url);
    // After the first load: a later load failing means the server is gone.
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, url, isMainFrame) => {
      if (!isRealLoadFailure(errorCode, isMainFrame)) return;
      onRuntimeFailure("Page load failed", new Error(`did-fail-load ${errorCode} ${errorDescription}: ${url}`));
    });
    mainWindow.show();
    splash.close();
    markBootDone();
    const pg = runningPostgres;
    if (pg) {
      stopPostgresWatch = watchLiveness({
        name: "Postgres",
        isAlive: () => pg.isAlive(),
        intervalMs: POSTGRES_WATCH_INTERVAL_MS,
        onDead: () => onRuntimeFailure("Postgres stopped unexpectedly", new Error("Postgres postmaster is no longer running")),
      });
    }
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

// A second double-click used to start a second Postgres on the same pgdata
// and show "undefined" (review should 21). Now it focuses the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = fatalWindow ?? mainWindow ?? BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    const boot = shouldUseFullBootPipeline() ? bootFullPipeline : bootDevMode;
    boot();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) boot();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

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
  stopPostgresWatch?.();

  (async () => {
    // Before the force-exit timer: Papa may choose to wait for a running
    // backup (files' UX 1.4). Closing anyway leaves a .tmp-* folder that the
    // next start removes.
    if (backupRunner?.busy && (await ask(quitWhileBackupDialog())) === 0) {
      await backupRunner.waitIdle();
    }
    const forceExit = setTimeout(() => app.exit(), FORCE_EXIT_MS);
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
