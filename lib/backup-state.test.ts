import { describe, expect, it } from "vitest";
import { backupBanner, backupState, formatBackupTime, type BackupStatusInput } from "./backup-state";

const now = new Date(2026, 9, 30, 9, 0); // Fr 30.10.2026, 09:00
const healthy: BackupStatusInput = { lastError: null, consecutiveFailures: 0, toolProblem: null };
const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).toISOString();

describe("formatBackupTime", () => {
  it("uses heute/gestern within 2 days, then weekday + date + age", () => {
    expect(formatBackupTime(new Date(2026, 9, 30, 2, 15), now)).toBe("heute, 02:15");
    expect(formatBackupTime(new Date(2026, 9, 29, 2, 15), now)).toBe("gestern, 02:15");
    expect(formatBackupTime(new Date(2026, 9, 28, 2, 15), now)).toBe("Mi 28.10.2026, 02:15");
    expect(formatBackupTime(new Date(2026, 9, 27, 2, 15), now)).toBe("Di 27.10.2026, 02:15 (vor 3 Tagen)");
  });
});

describe("backupState (files' UX 1.3)", () => {
  it("ok: verified backup from today", () => {
    expect(backupState(healthy, at(30, 2, 15), now)).toEqual({ tone: "ok", text: "Letzte Sicherung: heute, 02:15", canCreate: true });
  });

  it("orange after 48 h", () => {
    const s = backupState(healthy, at(27, 2, 15), now);
    expect(s.tone).toBe("warning");
    expect(s.text).toBe("Letzte Sicherung: Di 27.10.2026, 02:15 (vor 3 Tagen). Bitte heute sichern.");
  });

  it("orange when the last try failed but a recent backup exists, with the fixed reason text", () => {
    const s = backupState({ lastError: "diskFull", consecutiveFailures: 1, toolProblem: null }, at(29, 2, 15), now);
    expect(s).toMatchObject({ tone: "warning" });
    expect(s.text).toBe("Letzte Sicherung: gestern, 02:15. Die Sicherung von heute hat nicht geklappt: zu wenig Speicher auf dem PC.");
  });

  it("red after 7 days or after 2 failed tries in a row", () => {
    expect(backupState(healthy, at(20, 2, 15), now).text).toBe(
      "Letzte Sicherung: Di 20.10.2026, 02:15 (vor 10 Tagen). Die Daten sind nicht gesichert.",
    );
    expect(backupState({ lastError: "unknown", consecutiveFailures: 2, toolProblem: null }, at(30, 2, 15), now).tone).toBe("error");
  });

  it("red when there is no backup at all", () => {
    expect(backupState(healthy, null, now)).toEqual({
      tone: "error",
      text: "Noch keine Datensicherung. Die Daten sind nur auf diesem PC.",
      canCreate: true,
    });
  });

  it("broken tool wins and disables the button", () => {
    expect(backupState({ ...healthy, toolProblem: "pg_dump missing" }, at(30, 2, 15), now)).toEqual({
      tone: "error",
      text: "Datensicherung nicht möglich. Bitte HQ melden.",
      canCreate: false,
    });
  });

  it("uses the fixed reason text for a missing pg_dump (#3122)", () => {
    const s = backupState({ lastError: "toolMissing", consecutiveFailures: 1, toolProblem: null }, at(29, 2, 15), now);
    expect(s.text).toBe("Letzte Sicherung: gestern, 02:15. Die Sicherung von heute hat nicht geklappt: ein Teil der App fehlt, bitte HQ melden.");
  });
});

describe("backupBanner (files' UX 1.3, #3122)", () => {
  const failing: BackupStatusInput = { lastError: "unknown", consecutiveFailures: 2, toolProblem: null };

  it("shows nothing in the ok and orange states", () => {
    expect(backupBanner(healthy, at(30, 2, 15), now)).toBeNull();
    expect(backupBanner(healthy, at(27, 2, 15), now)).toBeNull();
    expect(backupBanner({ lastError: "diskFull", consecutiveFailures: 1, toolProblem: null }, at(29, 2, 15), now)).toBeNull();
  });

  it("broken tool wins and has no backup button", () => {
    expect(backupBanner({ ...failing, toolProblem: "pg_dump missing" }, null, now)).toEqual({
      text: "Datensicherung nicht möglich. Bitte HQ melden.",
      canCreate: false,
    });
  });

  it("never backed up", () => {
    expect(backupBanner(healthy, null, now)).toEqual({ text: "Daten noch nie gesichert.", canCreate: true });
  });

  it("too old counts calendar days, like the (vor N Tagen) bracket", () => {
    expect(backupBanner(healthy, at(20, 2, 15), now)).toEqual({ text: "Daten seit 10 Tagen nicht gesichert.", canCreate: true });
    expect(backupBanner(failing, at(28, 23, 50), now)?.text).toBe("Daten seit 2 Tagen nicht gesichert.");
  });

  it("2 failed tries with a backup under 2 days old never says 'seit 0/1 Tagen'", () => {
    expect(backupBanner(failing, at(30, 2, 15), now)?.text).toBe("Datensicherung hat zweimal nicht geklappt.");
    expect(backupBanner(failing, at(29, 2, 15), now)?.text).toBe("Datensicherung hat zweimal nicht geklappt.");
  });
});
