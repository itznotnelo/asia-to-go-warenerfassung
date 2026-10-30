import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import * as backup from "./backup";
import { loadConfig, saveConfig } from "./config";
import { copyFolderRefusal, removeCopyFolderDialog } from "./backup-dialogs";
import { buildRestoreChoices, preselectedChoice, toChoice } from "./restore-choices";

// Main-side handlers behind the preload's backupApi (files' UX 1.6). Only
// these named channels exist; the renderer never gets a generic ipcRenderer.
// Restore (backup:restore, backup:pickExternalFolder) is wired separately
// because it has to stop and restart the Next server.

function canWrite(dir: string): boolean {
  const probe = path.join(dir, `.asia-to-go-write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function registerBackupIpc(deps: backup.BackupDeps, runner: backup.BackupRunner, userDataDir: string): void {
  const root = deps.backupsRoot;

  ipcMain.handle("backup:status", () => ({
    status: backup.readStatus(root),
    newest: backup.newestVerified(root),
    copyFolder: loadConfig().backupCopyFolder ?? null,
    busy: runner.busy,
  }));

  // Joins a daily run that is already going (BackupRunner is single-flight).
  ipcMain.handle("backup:create", async () => {
    const result = await runner.run("manual");
    const folder = loadConfig().backupCopyFolder;
    const copy = result.ok && folder ? await backup.syncNewestToTarget(deps, folder) : null;
    return { result, copy };
  });

  ipcMain.handle("backup:list", () => {
    const folder = loadConfig().backupCopyFolder;
    const copyRoot = folder ? backup.copyRoot(folder) : null;
    return {
      local: backup.listBackups(root),
      copy: copyRoot && fs.existsSync(copyRoot) ? backup.listBackups(copyRoot) : [],
    };
  });

  ipcMain.handle("backup:openFolder", async () => {
    fs.mkdirSync(root, { recursive: true });
    return shell.openPath(root);
  });

  ipcMain.handle("backup:chooseCopyFolder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: "Ordner für die zweite Kopie wählen",
      properties: ["openDirectory", "createDirectory"],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const chosen = picked.filePaths[0];
    if (picked.canceled || !chosen) return { ok: false as const, canceled: true };

    const refusal = copyFolderRefusal(chosen, userDataDir, canWrite(chosen));
    if (refusal) return { ok: false as const, canceled: false, message: refusal };

    saveConfig({ ...loadConfig(), backupCopyFolder: chosen });
    // Copy the newest backup right away, so Papa sees it work (files' UX 1.5).
    const copy = await backup.syncNewestToTarget(deps, chosen);
    return { ok: true as const, folder: chosen, copy };
  });

  ipcMain.handle("backup:removeCopyFolder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const spec = { ...removeCopyFolderDialog(), noLink: true };
    const answer = win ? await dialog.showMessageBox(win, spec) : await dialog.showMessageBox(spec);
    if (answer.response !== 1) return { removed: false };
    const config = loadConfig();
    delete config.backupCopyFolder;
    saveConfig(config);
    return { removed: true };
  });

  // Restore R1/R2. Ids handed out here are the only folders backup:restore accepts.
  ipcMain.handle("backup:restoreChoices", () => {
    const folder = loadConfig().backupCopyFolder;
    const copyRoot = folder ? backup.copyRoot(folder) : null;
    const copy = copyRoot && fs.existsSync(copyRoot) ? backup.listBackups(copyRoot) : [];
    const { choices, dirs } = buildRestoreChoices(backup.listBackups(root), copy);
    restoreDirs.clear();
    for (const [id, dir] of dirs) restoreDirs.set(id, dir);
    return { choices, preselected: preselectedChoice(choices) };
  });

  // [Andere Sicherung suchen ...]: one backup folder, e.g. on a USB stick.
  ipcMain.handle("backup:pickExternalFolder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = { title: "Sicherung suchen", properties: ["openDirectory"] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const chosen = picked.filePaths[0];
    if (picked.canceled || !chosen) return { ok: false as const, canceled: true };
    const manifest = backup.readManifest(chosen);
    if (!manifest) return { ok: false as const, canceled: false, message: NOT_A_BACKUP };
    const id = `external:${chosen}`;
    restoreDirs.set(id, chosen);
    const choice = toChoice({ pool: manifest.kind, name: path.basename(chosen), dir: chosen, manifest }, "external", id);
    return { ok: true as const, choice };
  });

  // R2 "Jetzt": live count(*), null = database not readable (no safety copy possible).
  ipcMain.handle("backup:currentCounts", async () => {
    try {
      const counts = await deps.db.rowCounts(deps.conn);
      return { products: counts.Product ?? 0, images: counts.ProductImage ?? 0 };
    } catch {
      return null;
    }
  });
}

export const NOT_A_BACKUP = "In diesem Ordner ist keine Sicherung der App.";

// id -> backup folder, filled by backup:restoreChoices / backup:pickExternalFolder.
export const restoreDirs = new Map<string, string>();
