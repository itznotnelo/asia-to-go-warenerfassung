import type { BrowserWindow, WebPreferences } from "electron";

// Ticket #3071 (review #43): the app window only ever shows the local Next
// server. No pop-ups, no navigation away, no camera/mic/geolocation/etc.
// prompts, and the renderer gets no Node. The app has no external links today;
// if one is added, open it with shell.openExternal from an explicit allowlist
// here rather than loosening these handlers.

/**
 * Pass into every `new BrowserWindow({ ..., webPreferences })`. These are the
 * Electron defaults today; spelling them out keeps a future refactor or a
 * changed default from silently turning them off.
 */
export function secureWebPreferences(extra: Pick<WebPreferences, "preload"> = {}): WebPreferences {
  return {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    ...extra,
  };
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // file: and data: windows (splash, setup, fatal error) have the opaque origin "null".
    return parsed.origin === "null" ? null : parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Locks a window to `appUrl`'s origin. Call right after creating the window,
 * before loadURL/loadFile. Without `appUrl` (splash/setup/error windows that
 * load a local file) every navigation is blocked.
 */
export function applyWindowSecurity(win: BrowserWindow, appUrl?: string): void {
  const allowedOrigin = appUrl ? originOf(appUrl) : null;
  const contents = win.webContents;

  const isAllowed = (url: string): boolean => allowedOrigin !== null && originOf(url) === allowedOrigin;

  contents.setWindowOpenHandler(() => ({ action: "deny" }));

  const blockForeignNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!isAllowed(url)) event.preventDefault();
  };
  contents.on("will-navigate", blockForeignNavigation);
  contents.on("will-redirect", blockForeignNavigation);

  contents.on("will-attach-webview", (event) => event.preventDefault());

  const session = contents.session;
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}
