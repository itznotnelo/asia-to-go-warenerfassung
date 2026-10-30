import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CRASH_BUDGET_RESET_MS,
  createBootGate,
  createErrorThrottle,
  crashDecision,
  errorDetails,
  escapeHtml,
  fatalActionFromUrl,
  fatalScreenHtml,
  isRealLoadFailure,
  parseCrashRelaunches,
  relaunchArgs,
  updateFeedOverride,
  watchLiveness,
  withTimeout,
} from "../src/app-health";

afterEach(() => {
  vi.useRealTimers();
});

describe("fatal screen (should 21)", () => {
  it("is German, names the next step and the log path", () => {
    const html = fatalScreenHtml({ kind: "boot", error: new Error("boom"), logPath: "C:\\Users\\Papa\\logs\\main.log" });
    expect(html).toContain("Asia To Go konnte nicht starten");
    expect(html).toContain("den Computer neu starten");
    expect(html).toContain("Neu starten</a>");
    expect(html).toContain("Ordner öffnen</a>");
    expect(html).toContain("Protokoll: C:\\Users\\Papa\\logs\\main.log");
    expect(html).not.toMatch(/ß/);
  });

  it("puts the escaped stack behind <details>", () => {
    const err = new Error("<img src=x onerror=alert(1)>");
    const html = fatalScreenHtml({ kind: "boot", error: err, logPath: "x" });
    expect(html).toMatch(/<details>.*Technische Details.*&lt;img src=x onerror=alert\(1\)&gt;.*<\/details>/s);
    expect(html).not.toContain("<img");
  });

  it("never shows a bare 'undefined'", () => {
    expect(errorDetails(undefined)).toBe("Kein Fehlertext vorhanden.");
    expect(fatalScreenHtml({ kind: "boot", error: undefined, logPath: "x" })).not.toContain(">undefined<");
  });

  it("has its own title for a crash after boot", () => {
    expect(fatalScreenHtml({ kind: "runtime", error: "x", logPath: "x" })).toContain("Asia To Go läuft nicht mehr");
  });

  it("maps only its own button links to actions", () => {
    expect(fatalActionFromUrl("https://asia-to-go.invalid/restart")).toBe("restart");
    expect(fatalActionFromUrl("https://asia-to-go.invalid/open-log")).toBe("openLog");
    expect(fatalActionFromUrl("https://asia-to-go.invalid/other")).toBeNull();
    expect(fatalActionFromUrl("https://example.com/restart")).toBeNull();
  });

  it("escapes all HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("crash relaunch budget (should 24)", () => {
  it("relaunches twice in a row, then shows the fatal screen", () => {
    expect(crashDecision({ relaunchesSoFar: 0, uptimeMs: 1000 })).toEqual({ action: "relaunch", count: 1 });
    expect(crashDecision({ relaunchesSoFar: 1, uptimeMs: 1000 })).toEqual({ action: "relaunch", count: 2 });
    expect(crashDecision({ relaunchesSoFar: 2, uptimeMs: 1000 })).toEqual({ action: "fatal" });
  });

  it("starts a fresh budget after a healthy run", () => {
    expect(crashDecision({ relaunchesSoFar: 2, uptimeMs: CRASH_BUDGET_RESET_MS })).toEqual({ action: "relaunch", count: 1 });
  });

  it("carries the count through the relaunch args", () => {
    const args = relaunchArgs(["--foo"], 2);
    expect(args).toEqual(["--foo", "--crash-relaunches=2"]);
    expect(parseCrashRelaunches(["app.exe", ...args])).toBe(2);
    expect(relaunchArgs(args, 0)).toEqual(["--foo"]);
    expect(parseCrashRelaunches(["app.exe"])).toBe(0);
    expect(parseCrashRelaunches(["--crash-relaunches=abc"])).toBe(0);
  });

  it("ignores aborted and subframe load failures", () => {
    expect(isRealLoadFailure(-102, true)).toBe(true); // ERR_CONNECTION_REFUSED
    expect(isRealLoadFailure(-3, true)).toBe(false); // ERR_ABORTED
    expect(isRealLoadFailure(-102, false)).toBe(false);
  });
});

describe("watchLiveness (should 24)", () => {
  it("reports a dead process once and stops watching", async () => {
    vi.useFakeTimers();
    let alive = true;
    const onDead = vi.fn();
    watchLiveness({ name: "Postgres", isAlive: () => alive, onDead, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onDead).not.toHaveBeenCalled();
    alive = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead).toHaveBeenCalledWith("Postgres");
  });

  it("treats a throwing check as dead", async () => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    watchLiveness({ name: "x", isAlive: () => Promise.reject(new Error("no")), onDead, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after stop()", async () => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    const stop = watchLiveness({ name: "x", isAlive: () => false, onDead, intervalMs: 1000 });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDead).not.toHaveBeenCalled();
  });
});

describe("sync error throttle (should 21)", () => {
  it("logs the first failure, then once per window with the skipped count", () => {
    let t = 0;
    const throttle = createErrorThrottle(60_000, () => t);
    expect(throttle.failure()).toBe(0);
    t = 10_000;
    expect(throttle.failure()).toBeNull();
    t = 20_000;
    expect(throttle.failure()).toBeNull();
    t = 61_000;
    expect(throttle.failure()).toBe(2);
    expect(throttle.success()).toBe(true);
    expect(throttle.success()).toBe(false);
    expect(throttle.failure()).toBe(0);
  });
});

describe("updater helpers (should 22)", () => {
  it("accepts only an https feed override", () => {
    expect(updateFeedOverride({})).toBeNull();
    expect(updateFeedOverride({ ASIA_SHOP_UPDATE_FEED_URL: "https://feed.example/x" })).toBe("https://feed.example/x");
    expect(updateFeedOverride({ ASIA_SHOP_UPDATE_FEED_URL: "http://feed.example/x" })).toBeNull();
    expect(updateFeedOverride({ ASIA_SHOP_UPDATE_FEED_URL: "file:///C:/feed" })).toBeNull();
    expect(updateFeedOverride({ ASIA_SHOP_UPDATE_FEED_URL: "not a url" })).toBeNull();
  });

  it("withTimeout falls back on timeout and on rejection", async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise<string>(() => {}), 1000, "fallback");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(slow).resolves.toBe("fallback");
    await expect(withTimeout(Promise.reject(new Error("x")), 1000, "fb")).resolves.toBe("fb");
    await expect(withTimeout(Promise.resolve("ok"), 1000, "fb")).resolves.toBe("ok");
  });
});

describe("update dialog boot gate (review of 3134)", () => {
  it("holds the dialog while the boot (and its migrations) runs", () => {
    const gate = createBootGate();
    const show = vi.fn();
    gate.whenBootDone(show);
    expect(show).not.toHaveBeenCalled();
    gate.markBootDone();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("shows right away once the boot is done", () => {
    const gate = createBootGate();
    gate.markBootDone();
    const show = vi.fn();
    gate.whenBootDone(show);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest held request and runs it once", () => {
    const gate = createBootGate();
    const first = vi.fn();
    const second = vi.fn();
    gate.whenBootDone(first);
    gate.whenBootDone(second);
    gate.markBootDone();
    gate.markBootDone();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("never shows when the boot never finishes", () => {
    const gate = createBootGate();
    const show = vi.fn();
    gate.whenBootDone(show);
    expect(show).not.toHaveBeenCalled();
  });
});
