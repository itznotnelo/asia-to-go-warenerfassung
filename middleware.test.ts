import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(url: string, init: { method?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(url, { method: init.method ?? "GET", headers: init.headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware", () => {
  it("passes a same-origin request on the expected port", () => {
    vi.stubEnv("PORT", "51234");
    const res = middleware(
      request("http://127.0.0.1:51234/api/sync/drain", {
        method: "POST",
        headers: { host: "127.0.0.1:51234", origin: "http://127.0.0.1:51234" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("returns 403 for a rebinding Host", () => {
    vi.stubEnv("PORT", "51234");
    const res = middleware(request("http://127.0.0.1:51234/settings", { headers: { host: "evil.example:51234" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("x-guard")).toBe("host");
  });

  it("returns 403 for a foreign Origin on POST", () => {
    vi.stubEnv("PORT", "51234");
    const res = middleware(
      request("http://127.0.0.1:51234/api/sync/drain", {
        method: "POST",
        headers: { host: "127.0.0.1:51234", origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("x-guard")).toBe("origin");
  });

  it("accepts any loopback port when PORT is unset (pnpm dev)", () => {
    vi.stubEnv("PORT", "");
    const res = middleware(request("http://localhost:3000/", { headers: { host: "localhost:3000" } }));
    expect(res.status).toBe(200);
  });
});
