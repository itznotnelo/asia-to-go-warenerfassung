import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("setupApi", {
  submit: (email: string) => ipcRenderer.invoke("setup:submit", email),
});
