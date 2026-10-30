// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/products";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { BackupBanner } from "./backup-banner";

type Status = { lastError: null | "unknown"; consecutiveFailures: number; toolProblem: string | null };

function fakeApi(status: Status, newestCreatedAt: string | null) {
  const api = {
    status: vi.fn(async () => ({
      status: { ...status, copyLastOkAt: null, copyLastError: null },
      newest: newestCreatedAt ? { manifest: { createdAt: newestCreatedAt } } : null,
      copyFolder: null,
      busy: false,
      syncPausedSince: null,
    })),
    create: vi.fn(async () => ({ result: { ok: true, backup: { manifest: { createdAt: new Date().toISOString() } } }, copy: null })),
  };
  (window as unknown as { backupApi: unknown }).backupApi = api;
  return api;
}

const healthy: Status = { lastError: null, consecutiveFailures: 0, toolProblem: null };

async function show() {
  await act(async () => {
    render(<BackupBanner />);
  });
}

beforeEach(() => {
  pathname = "/products";
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { backupApi?: unknown }).backupApi;
});

describe("BackupBanner", () => {
  it("never backed up: red bar with [Jetzt sichern], which starts a backup and re-reads the status", async () => {
    const api = fakeApi(healthy, null);
    await show();
    expect(screen.getByRole("alert").textContent).toContain("Daten noch nie gesichert.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Jetzt sichern" }));
    });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it("is never shown on /scan", async () => {
    pathname = "/scan";
    fakeApi(healthy, null);
    await show();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("broken tool: no backup button, links to Einstellungen", async () => {
    fakeApi({ ...healthy, toolProblem: "pg_dump missing" }, null);
    await show();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Datensicherung nicht möglich. Bitte HQ melden." }).getAttribute("href")).toBe(
      "/settings#sicherung",
    );
  });

  it("shows nothing for a fresh backup or outside the desktop app", async () => {
    fakeApi(healthy, new Date().toISOString());
    await show();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    delete (window as unknown as { backupApi?: unknown }).backupApi;
    await show();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
