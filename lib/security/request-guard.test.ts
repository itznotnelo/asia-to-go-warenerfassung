import { describe, expect, it } from "vitest";
import { checkLocalRequest, isAllowedHost, isAllowedOrigin } from "./request-guard";

describe("isAllowedHost", () => {
  it("accepts loopback hosts", () => {
    expect(isAllowedHost("127.0.0.1:51234")).toBe(true);
    expect(isAllowedHost("localhost:3000")).toBe(true);
    expect(isAllowedHost("LOCALHOST:3000")).toBe(true);
    expect(isAllowedHost("[::1]:3000")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  it("rejects rebinding and LAN hosts", () => {
    expect(isAllowedHost("evil.example:51234")).toBe(false);
    expect(isAllowedHost("127.0.0.1.nip.io:51234")).toBe(false);
    expect(isAllowedHost("localhost.evil.example:3000")).toBe(false);
    expect(isAllowedHost("192.168.1.20:3000")).toBe(false);
    expect(isAllowedHost("0.0.0.0:3000")).toBe(false);
    expect(isAllowedHost("127.0.0.2:3000")).toBe(false);
  });

  it("rejects missing and malformed hosts", () => {
    expect(isAllowedHost(null)).toBe(false);
    expect(isAllowedHost("")).toBe(false);
    expect(isAllowedHost("127.0.0.1:3000@evil.example")).toBe(false);
    expect(isAllowedHost("127.0.0.1:3000/evil")).toBe(false);
    expect(isAllowedHost("127.0.0.1:abc")).toBe(false);
  });

  it("enforces the expected port when given", () => {
    expect(isAllowedHost("127.0.0.1:51234", "51234")).toBe(true);
    expect(isAllowedHost("127.0.0.1:51235", "51234")).toBe(false);
    expect(isAllowedHost("127.0.0.1", "51234")).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  const host = "127.0.0.1:51234";

  it("lets safe methods through regardless of Origin", () => {
    expect(isAllowedOrigin("GET", "https://evil.example", host)).toBe(true);
    expect(isAllowedOrigin("HEAD", null, host)).toBe(true);
  });

  it("accepts a write from the app's own origin or with no Origin", () => {
    expect(isAllowedOrigin("POST", "http://127.0.0.1:51234", host)).toBe(true);
    expect(isAllowedOrigin("POST", null, host)).toBe(true);
  });

  it("rejects a write from any other origin", () => {
    expect(isAllowedOrigin("POST", "https://evil.example", host)).toBe(false);
    expect(isAllowedOrigin("POST", "http://localhost:51234", host)).toBe(false);
    expect(isAllowedOrigin("POST", "http://127.0.0.1:3000", host)).toBe(false);
    expect(isAllowedOrigin("POST", "https://127.0.0.1:51234", host)).toBe(false);
    expect(isAllowedOrigin("DELETE", "null", host)).toBe(false);
  });
});

describe("checkLocalRequest", () => {
  const base = { host: "127.0.0.1:51234", origin: null, secFetchSite: null, expectedPort: "51234" };

  it("allows the Electron window and the main-process drain", () => {
    expect(checkLocalRequest({ ...base, method: "GET" })).toEqual({ ok: true });
    expect(checkLocalRequest({ ...base, method: "POST" })).toEqual({ ok: true });
    expect(
      checkLocalRequest({ ...base, method: "POST", origin: "http://127.0.0.1:51234", secFetchSite: "same-origin" }),
    ).toEqual({ ok: true });
  });

  it("blocks DNS rebinding reading /settings", () => {
    expect(checkLocalRequest({ ...base, method: "GET", host: "rebind.evil.example:51234" })).toMatchObject({
      ok: false,
      status: 403,
      reason: "host",
    });
  });

  it("blocks CSRF against /api/sync/drain", () => {
    expect(checkLocalRequest({ ...base, method: "POST", origin: "https://evil.example" })).toMatchObject({
      ok: false,
      reason: "origin",
    });
    expect(checkLocalRequest({ ...base, method: "POST", secFetchSite: "cross-site" })).toMatchObject({
      ok: false,
      reason: "origin",
    });
  });

  it("does not block a cross-site GET by Sec-Fetch-Site alone", () => {
    expect(checkLocalRequest({ ...base, method: "GET", secFetchSite: "cross-site" })).toEqual({ ok: true });
  });
});
