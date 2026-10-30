// Pure helpers for the main process' failure paths (review should 21/22/24):
// the German fatal screen, crash relaunch budget, liveness watch, log throttle
// and the update feed check. No electron imports, so vitest can load them.

export type FatalKind = "boot" | "runtime";
export type FatalAction = "restart" | "openLog";

// Buttons on the fatal screen are plain links; main.ts' will-navigate handler
// cancels the navigation and runs the action. .invalid never resolves, so a
// missed handler can't leave the app.
const FATAL_ACTION_BASE = "https://asia-to-go.invalid/";
const FATAL_ACTIONS: Record<string, FatalAction> = { restart: "restart", "open-log": "openLog" };

export function fatalActionFromUrl(url: string): FatalAction | null {
  if (!url.startsWith(FATAL_ACTION_BASE)) return null;
  return FATAL_ACTIONS[url.slice(FATAL_ACTION_BASE.length)] ?? null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// embedded-postgres rejects start() with no argument, which used to show up
// as a bare "undefined" on the fatal screen.
export function errorDetails(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  if (err === undefined || err === null || err === "") return "Kein Fehlertext vorhanden.";
  return String(err);
}

export function fatalScreenHtml(o: { kind: FatalKind; error: unknown; logPath: string }): string {
  const title = o.kind === "boot" ? "Asia To Go konnte nicht starten" : "Asia To Go läuft nicht mehr";
  const button =
    "display:inline-block;margin:0 0.5rem 0.5rem 0;padding:0.55rem 1rem;border-radius:6px;" +
    "text-decoration:none;font-weight:600;";
  return (
    `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><title>Asia To Go</title></head>` +
    `<body style="font-family:'Segoe UI',sans-serif;background:#1c1a17;color:#f2ede4;padding:1.5rem;line-height:1.4">` +
    `<h2 style="margin-top:0">${title}</h2>` +
    `<p>Bitte auf «Neu starten» klicken. Hilft das nicht, den Computer neu starten.</p>` +
    `<p>Passiert es wieder, ein Foto von diesem Fenster an Nelo schicken.</p>` +
    `<p><a href="${FATAL_ACTION_BASE}restart" style="${button}background:#e08a3e;color:#1c1a17">Neu starten</a>` +
    `<a href="${FATAL_ACTION_BASE}open-log" style="${button}border:1px solid #b5aa9a;color:#f2ede4">Ordner öffnen</a></p>` +
    `<p style="font-size:0.8rem;color:#b5aa9a">Protokoll: ${escapeHtml(o.logPath)}</p>` +
    `<details><summary style="cursor:pointer;color:#b5aa9a">Technische Details</summary>` +
    `<pre style="white-space:pre-wrap;font-size:0.75rem">${escapeHtml(errorDetails(o.error))}</pre></details>` +
    `</body></html>`
  );
}

// ---- crash relaunch budget (should 24) ----

// A Next or Postgres crash relaunches the app at most this many times in a
// row; after that the fatal screen shows instead of a relaunch loop.
export const MAX_CRASH_RELAUNCHES = 2;
// Running this long since the last relaunch counts as healthy again.
export const CRASH_BUDGET_RESET_MS = 10 * 60 * 1000;
const CRASH_FLAG = "--crash-relaunches=";

export function parseCrashRelaunches(argv: readonly string[]): number {
  const arg = argv.find((a) => a.startsWith(CRASH_FLAG));
  const n = arg ? Number(arg.slice(CRASH_FLAG.length)) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Args for app.relaunch(); count 0 drops the flag (manual "Neu starten").
export function relaunchArgs(argv: readonly string[], count: number): string[] {
  const rest = argv.filter((a) => !a.startsWith(CRASH_FLAG));
  return count > 0 ? [...rest, `${CRASH_FLAG}${count}`] : rest;
}

export type CrashDecision = { action: "relaunch"; count: number } | { action: "fatal" };

export function crashDecision(o: { relaunchesSoFar: number; uptimeMs: number }): CrashDecision {
  const soFar = o.uptimeMs >= CRASH_BUDGET_RESET_MS ? 0 : o.relaunchesSoFar;
  return soFar < MAX_CRASH_RELAUNCHES ? { action: "relaunch", count: soFar + 1 } : { action: "fatal" };
}

// did-fail-load also fires for aborted loads (-3, e.g. a navigation that
// replaced another one) and for subframes; neither means the server is gone.
export function isRealLoadFailure(errorCode: number, isMainFrame: boolean): boolean {
  return isMainFrame && errorCode !== -3;
}

// ---- liveness watch (should 24) ----

export interface LivenessWatchOptions {
  name: string;
  isAlive: () => boolean | Promise<boolean>;
  onDead: (name: string) => void;
  intervalMs: number;
}

// Calls onDead once, the first time isAlive says no (or throws). Returns stop().
export function watchLiveness(o: LivenessWatchOptions): () => void {
  let stopped = false;
  let checking = false;
  const timer = setInterval(async () => {
    if (stopped || checking) return;
    checking = true;
    let alive: boolean;
    try {
      alive = await o.isAlive();
    } catch {
      alive = false;
    }
    checking = false;
    if (alive || stopped) return;
    stop();
    o.onDead(o.name);
  }, o.intervalMs);
  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };
  return stop;
}

// ---- log throttle (should 21) ----

// While the shop is offline the 60 s sync poll fails every pass. Log the first
// failure, then at most one line per window with the number left out.
export function createErrorThrottle(windowMs: number, now: () => number = Date.now) {
  let lastLoggedAt: number | null = null;
  let suppressed = 0;
  return {
    // Returns null to stay quiet, or the number of failures skipped since the last line.
    failure(): number | null {
      const t = now();
      if (lastLoggedAt !== null && t - lastLoggedAt < windowMs) {
        suppressed += 1;
        return null;
      }
      const skipped = suppressed;
      lastLoggedAt = t;
      suppressed = 0;
      return skipped;
    },
    // True when this success ends a run of failures (worth one "recovered" line).
    success(): boolean {
      const wasFailing = lastLoggedAt !== null;
      lastLoggedAt = null;
      suppressed = 0;
      return wasFailing;
    },
  };
}

// ---- updater (should 22) ----

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// The test feed override may only point at https, so a stray env variable
// can't make a release build install from a plain-http source.
export function updateFeedOverride(env: Record<string, string | undefined>): string | null {
  const raw = env.ASIA_SHOP_UPDATE_FEED_URL;
  if (!raw) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

// The "Jetzt neu starten" dialog must not show while the boot is still in
// encoding recovery, UTF8 migration, backup-before-migrate or prisma migrate:
// accepting it quits and stops Postgres mid-migration. whenBootDone holds the
// latest request until markBootDone, then runs it once.
export function createBootGate() {
  let done = false;
  let pending: (() => void) | null = null;
  return {
    whenBootDone(fn: () => void): void {
      if (done) fn();
      else pending = fn;
    },
    markBootDone(): void {
      if (done) return;
      done = true;
      const fn = pending;
      pending = null;
      fn?.();
    },
  };
}

// The two buttons of the "Eine neue Version ist bereit" dialog (#44).
export const UPDATE_DIALOG_BUTTONS = ["Jetzt neu starten", "Später"] as const;
const INSTALL_NOW = 0;

export interface QuitInstaller {
  autoInstallOnAppQuit: boolean;
  quitAndInstall(): void;
}

// "Später" (or closing the dialog) must really mean later: electron-updater
// installs a downloaded update on the next quit by default, so turn that off
// until Papa clicks "Jetzt neu starten" in a later dialog. Before he answers,
// install-on-quit stays on: a boot that never shows the window still gets
// its fix on quit. electron-updater 7 renames this to autoInstallEvent = "manual".
export function applyUpdateDialogChoice(response: number, updater: QuitInstaller): void {
  if (response === INSTALL_NOW) {
    updater.quitAndInstall();
    return;
  }
  updater.autoInstallOnAppQuit = false;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
