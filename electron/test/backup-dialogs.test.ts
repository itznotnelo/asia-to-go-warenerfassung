import { describe, expect, it } from "vitest";
import {
  blockedDialog,
  migrateFailedDialog,
  quitWhileBackupDialog,
  restoredWaitingDialog,
  waitingForFixDialog,
  whenText,
} from "../src/backup-dialogs";

const now = new Date(2026, 9, 30, 9, 15);

describe("whenText", () => {
  it("says heute / gestern / the date", () => {
    expect(whenText(new Date(2026, 9, 30, 7, 58), now)).toBe("heute, 07:58");
    expect(whenText(new Date(2026, 9, 29, 2, 14), now)).toBe("gestern, 02:14");
    expect(whenText(new Date(2026, 9, 27, 18, 5), now)).toBe("27.10., 18:05");
  });
});

describe("update dialogs", () => {
  it("3.3 blocked: names the reason, Enter/Esc = Schliessen", () => {
    const d = blockedDialog("diskFull");
    expect(d.detail).toContain("(zu wenig Speicher auf dem PC)");
    expect(d.buttons).toEqual(["Nochmals versuchen", "Schliessen"]);
    expect(d.defaultId).toBe(1);
    expect(d.cancelId).toBe(1);
  });

  it("3.1 migrate failed: offers the pre-update state, but Enter keeps the data as is", () => {
    const d = migrateFailedDialog({ createdAt: new Date(2026, 9, 30, 7, 58).toISOString() }, now);
    expect(d.detail).toContain("Stand heute, 07:58, direkt vor dem Update.");
    expect(d.buttons).toEqual(["Stand von 07:58 zurückholen", "Schliessen, nichts ändern"]);
    expect(d.buttons[d.defaultId]).toBe("Schliessen, nichts ändern");
    expect(d.buttons[d.cancelId]).toBe("Schliessen, nichts ändern");
  });

  it("3.2 without a readable backup: only 'call HQ'", () => {
    const d = migrateFailedDialog(null, now);
    expect(d.detail).toBe("Bitte HQ anrufen. Die Daten nicht anfassen.");
    expect(d.buttons).toEqual(["Schliessen"]);
  });

  it("after the restore: says when and how many articles", () => {
    const d = restoredWaitingDialog({ createdAt: new Date(2026, 9, 30, 7, 58).toISOString(), rowCounts: { Product: 412 } }, now);
    expect(d.message).toBe("Die Daten von heute, 07:58 sind zurück (412 Artikel).");
    expect(d.detail).toContain("Bis dahin Ware auf Papier notieren.");
  });

  it("waiting for a fixed version", () => {
    expect(waitingForFixDialog().message).toBe("Die App wartet auf eine reparierte Version. Die Daten sind sicher.");
  });

  it("quit while a backup runs: Enter = Warten", () => {
    const d = quitWhileBackupDialog();
    expect(d.buttons[d.defaultId]).toBe("Warten");
    expect(d.buttons[d.cancelId]).toBe("Warten");
  });
});
