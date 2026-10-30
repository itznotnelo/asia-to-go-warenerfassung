// Lives outside electron/src on purpose: electron/tsconfig.json compiles
// src/**/*.ts into the packaged app, and a test file has no business there.
import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { applyWindowSecurity, secureWebPreferences } from "./src/window-security";

type Listener = (event: { preventDefault(): void }, url: string) => void;

function fakeWindow() {
  const listeners = new Map<string, Listener>();
  let openHandler: ((details: { url: string }) => { action: string }) | undefined;
  let requestHandler: ((wc: unknown, permission: string, cb: (granted: boolean) => void) => void) | undefined;
  let checkHandler: ((...args: unknown[]) => boolean) | undefined;

  const win = {
    webContents: {
      setWindowOpenHandler: (fn: typeof openHandler) => {
        openHandler = fn;
      },
      on: (name: string, fn: Listener) => {
        listeners.set(name, fn);
      },
      session: {
        setPermissionRequestHandler: (fn: typeof requestHandler) => {
          requestHandler = fn;
        },
        setPermissionCheckHandler: (fn: typeof checkHandler) => {
          checkHandler = fn;
        },
      },
    },
  };

  const fire = (name: string, url = "") => {
    const event = { preventDefault: vi.fn() };
    listeners.get(name)?.(event, url);
    return event.preventDefault.mock.calls.length > 0;
  };

  return {
    win: win as unknown as BrowserWindow,
    open: (url: string) => openHandler?.({ url }),
    blocked: (name: string, url?: string) => fire(name, url),
    requestPermission: (permission: string) => {
      const cb = vi.fn();
      requestHandler?.({}, permission, cb);
      return cb.mock.calls[0]?.[0];
    },
    checkPermission: (permission: string) => checkHandler?.({}, permission, "http://127.0.0.1:51234", {}),
  };
}

describe("applyWindowSecurity", () => {
  const appUrl = "http://127.0.0.1:51234";

  it("denies every window.open / target=_blank", () => {
    const w = fakeWindow();
    applyWindowSecurity(w.win, appUrl);
    expect(w.open("https://evil.example")).toEqual({ action: "deny" });
    expect(w.open(`${appUrl}/products`)).toEqual({ action: "deny" });
  });

  it("allows navigation within the app origin only", () => {
    const w = fakeWindow();
    applyWindowSecurity(w.win, appUrl);
    expect(w.blocked("will-navigate", `${appUrl}/settings`)).toBe(false);
    expect(w.blocked("will-navigate", "https://evil.example/")).toBe(true);
    expect(w.blocked("will-navigate", "http://127.0.0.1:51235/")).toBe(true);
    expect(w.blocked("will-navigate", "http://localhost:51234/")).toBe(true);
    expect(w.blocked("will-navigate", "file:///C:/Windows/win.ini")).toBe(true);
    expect(w.blocked("will-navigate", "javascript:alert(1)")).toBe(true);
    expect(w.blocked("will-navigate", "not a url")).toBe(true);
    expect(w.blocked("will-redirect", "https://evil.example/")).toBe(true);
    expect(w.blocked("will-redirect", `${appUrl}/products`)).toBe(false);
  });

  it("blocks all navigation for a file-loaded window without appUrl", () => {
    const w = fakeWindow();
    applyWindowSecurity(w.win);
    expect(w.blocked("will-navigate", "file:///app/splash.html")).toBe(true);
    expect(w.blocked("will-navigate", appUrl)).toBe(true);
  });

  it("refuses webview attachment", () => {
    const w = fakeWindow();
    applyWindowSecurity(w.win, appUrl);
    expect(w.blocked("will-attach-webview")).toBe(true);
  });

  it("denies permission requests and checks by default", () => {
    const w = fakeWindow();
    applyWindowSecurity(w.win, appUrl);
    for (const permission of ["media", "geolocation", "notifications", "clipboard-read", "openExternal"]) {
      expect(w.requestPermission(permission)).toBe(false);
      expect(w.checkPermission(permission)).toBe(false);
    }
  });
});

describe("secureWebPreferences", () => {
  it("spells out the isolation settings", () => {
    expect(secureWebPreferences()).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it("keeps a preload path and cannot be used to switch isolation off", () => {
    const prefs = secureWebPreferences({ preload: "/app/preload.js" });
    expect(prefs.preload).toBe("/app/preload.js");
    expect(prefs.contextIsolation).toBe(true);
  });
});
