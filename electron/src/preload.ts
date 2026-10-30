import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("setupApi", {
  submit: (email: string) => ipcRenderer.invoke("setup:submit", email),
});

// Narrow bridge for Einstellungen "Datensicherung" (files' UX 1.6). Handlers: backup-ipc.ts.
contextBridge.exposeInMainWorld("backupApi", {
  status: () => ipcRenderer.invoke("backup:status"),
  create: () => ipcRenderer.invoke("backup:create"),
  list: () => ipcRenderer.invoke("backup:list"),
  chooseCopyFolder: () => ipcRenderer.invoke("backup:chooseCopyFolder"),
  removeCopyFolder: () => ipcRenderer.invoke("backup:removeCopyFolder"),
  openFolder: () => ipcRenderer.invoke("backup:openFolder"),
  restoreChoices: () => ipcRenderer.invoke("backup:restoreChoices"),
  pickExternalFolder: () => ipcRenderer.invoke("backup:pickExternalFolder"),
  currentCounts: () => ipcRenderer.invoke("backup:currentCounts"),
  restore: (id: string) => ipcRenderer.invoke("backup:restore", id),
});

// Restore screens R3/R4 (restore.html): main pushes the state, buttons answer.
contextBridge.exposeInMainWorld("restoreUi", {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on("restore:state", (_event, state) => cb(state));
  },
  action: (name: string) => ipcRenderer.invoke("restore:action", name),
});
