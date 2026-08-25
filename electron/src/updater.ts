import { app, dialog } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

// Only meaningful once packaged and published via electron-builder's GitHub
// provider (electron-builder.config.js's `publish` block) — dev/unpackaged
// runs have no update feed to check and would just log a harmless failure.
export function initAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;

  // Debug/test escape hatch — points at a local feed folder instead of
  // GitHub, so the actual download/verify/install flow can be verified
  // without needing two real published releases.
  if (process.env.ASIA_SHOP_UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({ provider: "generic", url: process.env.ASIA_SHOP_UPDATE_FEED_URL });
  }

  autoUpdater.on("update-downloaded", () => {
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

  autoUpdater.on("error", (err) => {
    log.error("Auto-update check failed", err);
  });

  autoUpdater.checkForUpdates().catch((err) => log.error("checkForUpdates failed", err));
}
