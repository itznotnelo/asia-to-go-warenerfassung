// Ticket #3071 (review #38): the Next server only ever serves the Electron
// window on this laptop. Any other Host header means DNS rebinding (a web page
// whose own domain now resolves to 127.0.0.1), and a foreign Origin on a
// write means CSRF from another browser tab. Pure functions so middleware.ts
// stays a thin wrapper and the rules can be tested without a Next runtime.

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type GuardResult = { ok: true } | { ok: false; status: 403; reason: string };

/** "127.0.0.1:3000" -> { hostname: "127.0.0.1", port: "3000" }; null if malformed. */
function splitHost(host: string): { hostname: string; port: string } | null {
  const match = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(host);
  if (!match) return null;
  return { hostname: match[1].toLowerCase(), port: match[2] ?? "" };
}

/**
 * True only for a loopback hostname. When `expectedPort` is given (the PORT
 * the Electron main process hands the server), the port must match too.
 */
export function isAllowedHost(host: string | null, expectedPort?: string): boolean {
  if (!host) return false;
  const parts = splitHost(host.trim());
  if (!parts || !LOOPBACK_HOSTNAMES.has(parts.hostname)) return false;
  if (expectedPort && parts.port !== expectedPort) return false;
  return true;
}

/**
 * Writes must come from the app's own origin. A missing Origin is allowed:
 * the Electron main process's background drain (fetch from Node) and local
 * scripts send none, and a browser always sends one on a cross-site POST.
 */
export function isAllowedOrigin(method: string, origin: string | null, host: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (origin === null) return true;
  return origin.toLowerCase() === `http://${host.toLowerCase()}`;
}

export function checkLocalRequest(input: {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  expectedPort?: string;
}): GuardResult {
  const { method, host, origin, secFetchSite, expectedPort } = input;
  if (!host || !isAllowedHost(host, expectedPort)) {
    return { ok: false, status: 403, reason: "host" };
  }
  if (!isAllowedOrigin(method, origin, host)) {
    return { ok: false, status: 403, reason: "origin" };
  }
  // Belt and braces for browsers that strip Origin: they still mark the request.
  if (!SAFE_METHODS.has(method.toUpperCase()) && secFetchSite === "cross-site") {
    return { ok: false, status: 403, reason: "origin" };
  }
  return { ok: true };
}
