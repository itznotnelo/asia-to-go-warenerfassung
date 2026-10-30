import { app, dialog } from "electron";
import log from "electron-log";
import { autoUpdater, type UpdateCheckResult } from "electron-updater";
import { UPDATE_CHECK_INTERVAL_MS, createBootGate, updateFeedOverride, withTimeout } from "./app-health";

let started = false;
const bootGate = createBootGate();
let lastCheck: Promise<UpdateCheckResult | null> | null = null;
// Set when a failed boot waits for a fix: install silently, no "Später" dialog.
let installingAfterFailedBoot = false;

function checkNow(): void {
  lastCheck = autoUpdater.checkForUpdates().catch((err) => {
    log.error("checkForUpdates failed", err);
    return null;
  });
}

// Only meaningful once packaged and published via electron-builder's GitHub
// provider (electron-builder.config.js's `publish` block) — dev/unpackaged
// runs have no update feed to check and would just log a harmless failure.
// Called at the start of every boot, so a release that fails to boot can
// still fetch its fix (review should 22). Safe to call more than once.
export function initAutoUpdater(): void {
  if (!app.isPackaged || started) return;
  started = true;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;

  // Debug/test escape hatch — points at a local feed folder instead of
  // GitHub, so the actual download/verify/install flow can be verified
  // without needing two real published releases. https only.
  const feed = updateFeedOverride(process.env);
  if (feed) {
    autoUpdater.setFeedURL({ provider: "generic", url: feed });
  } else if (process.env.ASIA_SHOP_UPDATE_FEED_URL) {
    log.warn("Ignoring ASIA_SHOP_UPDATE_FEED_URL: only https feeds are allowed");
  }

  // Held until the main window shows, so it can't interrupt a migration. A
  // boot that never finishes never shows it; the update then installs on quit.
  autoUpdater.on("update-downloaded", () => {
    bootGate.whenBootDone(() => {
      if (installingAfterFailedBoot) return;
      dialog
        .showMessageBox({
          type: "info",
          title: "Asia To Go",
          message: "Eine neue Version ist bereit.",
          detail: "Jetzt neu starten, um sie zu installieren?",
          buttons: ["Jetzt neu starten", "Später"],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        });
    });
  });

  autoUpdater.on("error", (err) => {
    log.error("Auto-update check failed", err);
  });

  checkNow();
  // A PC that keeps the app open for days still sees new releases.
  setInterval(checkNow, UPDATE_CHECK_INTERVAL_MS).unref();
}

// Called by main.ts once the main window shows: DB migrations are over, a
// downloaded update may now ask for a restart.
export function markBootDone(): void {
  bootGate.markBootDone();
}

const CHECK_WAIT_MS = 30_000;

/**
 * Boot failed and the app is about to quit: if the running check finds a
 * newer release, call onDownloading (to tell Papa), wait for the download and
 * install it silently with a restart. Returns false when there is nothing to
 * install in time; the caller then quits as before.
 */
export async function installUpdateInsteadOfQuit(onDownloading: () => void, downloadWaitMs: number): Promise<boolean> {
  if (!started || !lastCheck) return false;
  installingAfterFailedBoot = true;
  const result = await withTimeout(lastCheck, CHECK_WAIT_MS, null);
  if (!result?.isUpdateAvailable || !result.downloadPromise) {
    installingAfterFailedBoot = false;
    return false;
  }
  log.info(`[update] boot failed, installing ${result.updateInfo.version} instead of quitting`);
  onDownloading();
  const downloaded = await withTimeout(
    result.downloadPromise.then(() => true),
    downloadWaitMs,
    false,
  );
  if (!downloaded) {
    log.warn("[update] download did not finish in time, quitting without it");
    installingAfterFailedBoot = false;
    return false;
  }
  autoUpdater.quitAndInstall(true, true);
  return true;
}
