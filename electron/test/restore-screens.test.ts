import { describe, expect, it } from "vitest";
import type { RestoreResult } from "../src/backup/restore";
import type { Manifest } from "../src/backup/types";
import { RESTORE_STEPS, restoreOutcome, restoreReport, stepStates } from "../src/restore-screens";

const now = new Date(2026, 9, 30, 9, 15);
const createdAt = new Date(2026, 9, 30, 2, 15).toISOString();
const manifest = { rowCounts: { Product: 412, ProductImage: 530 } } as unknown as Manifest;
const ok: RestoreResult = { ok: true, manifest, safetyBackup: null, previousImagesDir: null };

function fail(step: "verify" | "safety" | "db" | "images" | "migrate", changed: boolean, rolledBack: boolean): RestoreResult {
  return { ok: false, step, error: "boom", changed, rolledBack, appStopped: step !== "verify" };
}

describe("R3 steps", () => {
  it("shows the spec order", () => {
    expect(RESTORE_STEPS.map((s) => s.label)).toEqual([
      "Sicherung prüfen",
      "Heutigen Stand sichern",
      "Daten zurückholen",
      "Bilder zurückholen",
      "Alles prüfen",
    ]);
  });

  it("marks steps done in engine order (images are unpacked before the DB step)", () => {
    expect(stepStates("images")).toEqual({ verify: "done", safety: "done", db: "todo", images: "running", check: "todo" });
    expect(stepStates("db")).toEqual({ verify: "done", safety: "done", db: "running", images: "done", check: "todo" });
    expect(stepStates("check")).toEqual({ verify: "done", safety: "done", db: "done", images: "done", check: "running" });
  });
});

describe("restoreOutcome", () => {
  it("R4a with sync: counts, undo hint, orders line, paused box, focus on Später", () => {
    const s = restoreOutcome(ok, createdAt, now, true);
    expect(s.kind).toBe("ok");
    expect(s.title).toBe("Fertig. Die Daten von heute, 02:15 sind zurück.");
    expect(s.lines).toEqual([
      "412 Artikel, 530 Bilder.",
      'Falls es die falsche Sicherung war: nochmals "Daten zurückholen" und "Stand vor dem Zurückholen" wählen.',
      "Bestellungen nach heute, 02:15 fehlen hier. Sie sind im Shop-Backend noch da.",
    ]);
    expect(s.sync?.paused).toBe("Website-Abgleich ist angehalten.");
    expect(s.buttons.map((b) => b.label)).toEqual(["Später", "Artikel neu an die Website senden"]);
    expect(s.focus).toBe("later");
    expect(s.startApp).toBe(true);
  });

  it("R4a without sync: no paused box, single OK", () => {
    const s = restoreOutcome(ok, createdAt, now, false);
    expect(s.sync).toBeNull();
    expect(s.lines).toHaveLength(2);
    expect(s.buttons.map((b) => b.label)).toEqual(["OK"]);
  });

  it("damaged backup goes back to R1", () => {
    const s = restoreOutcome(fail("verify", false, false), createdAt, now, true);
    expect(s.kind).toBe("damaged");
    expect(s.lines).toEqual(["Diese Sicherung ist beschädigt. Bitte eine andere wählen."]);
    expect(s.buttons.map((b) => b.action)).toEqual(["chooseOther"]);
  });

  it("R4b says nichts verloren only when nothing changed or the rollback worked", () => {
    for (const r of [fail("safety", false, false), fail("images", false, false), fail("db", true, true)]) {
      const s = restoreOutcome(r, createdAt, now, true);
      expect(s.kind).toBe("failed");
      expect(s.lines[0]).toBe("Es ist nichts verloren: der Stand von vorher ist wieder da.");
      expect(s.lines[1]).toMatch(/^Grund: /);
      expect(s.focus).toBe("close");
      expect(s.startApp).toBe(true);
    }
  });

  it("fatal when the rollback failed too: Next stays stopped", () => {
    for (const r of [fail("db", true, false), fail("migrate", true, false)]) {
      const s = restoreOutcome(r, createdAt, now, true);
      expect(s.kind).toBe("fatal");
      expect(s.title).toBe("Die Daten konnten nicht zurückgeholt werden. Bitte die App nicht mehr benutzen und HQ anrufen.");
      expect(s.buttons.map((b) => b.label)).toEqual(["Ordner öffnen", "Fehlerbericht kopieren"]);
      expect(s.startApp).toBe(false);
    }
  });
});

describe("restoreReport", () => {
  it("has version, step, error and folder", () => {
    const text = restoreReport("1.2.0", "C:\\backups\\daily\\x", fail("db", true, false), new Date("2026-10-30T08:00:00Z"));
    expect(text).toContain("Version: 1.2.0");
    expect(text).toContain("Schritt: db");
    expect(text).toContain("Fehler: boom");
    expect(text).toContain("Sicherung: C:\\backups\\daily\\x");
  });
});
