import { describe, expect, it } from "vitest";
import { r2Text, restoreKindText, restoreLocationText, restoreWhen } from "./restore-text";

const now = new Date(2026, 9, 30, 9, 15);

describe("restoreWhen", () => {
  it("says heute / gestern / weekday + full date without the age suffix", () => {
    expect(restoreWhen(new Date(2026, 9, 30, 2, 15), now)).toBe("heute, 02:15");
    expect(restoreWhen(new Date(2026, 9, 29, 2, 14), now)).toBe("gestern, 02:14");
    expect(restoreWhen(new Date(2026, 9, 28, 7, 58), now)).toBe("Mi 28.10.2026, 07:58");
    expect(restoreWhen(new Date(2026, 9, 20, 2, 10), now)).toBe("Di 20.10.2026, 02:10");
  });
});

describe("labels", () => {
  it("maps every pool to the spec's kind text", () => {
    expect(restoreKindText("daily")).toBe("Automatisch");
    expect(restoreKindText("manual")).toBe("Von Hand");
    expect(restoreKindText("pre-migrate")).toBe("Vor Update");
    expect(restoreKindText("pre-restore")).toBe("Stand vor dem Zurückholen");
    expect(restoreKindText("encoding-migration")).toBe("Vor der Umstellung");
  });

  it("names the location", () => {
    expect(restoreLocationText("local", "E:\\")).toBe("Dieser PC");
    expect(restoreLocationText("copy", "E:\\")).toBe("E:\\");
    expect(restoreLocationText("external", null)).toBe("Anderer Ordner");
  });
});

describe("r2Text", () => {
  const backup = { createdAt: new Date(2026, 9, 30, 2, 15).toISOString(), products: 412, images: 530 };

  it("builds the confirm screen with live counts", () => {
    expect(r2Text(backup, { products: 418, images: 534 }, now)).toEqual({
      title: "Daten von heute, 02:15 zurückholen?",
      body: "Alles, was nach heute, 02:15 erfasst oder geändert wurde, wird überschrieben und ist danach weg: Artikel, Preise, Bilder und Bestellungen.",
      now: "Jetzt: 418 Artikel, 534 Bilder",
      after: "Nach dem Zurückholen: 412 Artikel, 530 Bilder",
      safety:
        "Der heutige Stand wird vorher automatisch gesichert. Falls es die falsche Sicherung war, lässt er sich wieder zurückholen.",
      oldWarning: null,
    });
  });

  it("says nicht lesbar and no safety copy when the database can't be read", () => {
    const t = r2Text(backup, null, now);
    expect(t.now).toBe("Jetzt: nicht lesbar");
    expect(t.safety).toBe("Der heutige Stand kann nicht mehr gesichert werden.");
  });

  it("warns only for backups older than 7 days", () => {
    const at = (d: number) => ({ ...backup, createdAt: new Date(2026, 9, d, 2, 15).toISOString() });
    expect(r2Text(at(23), null, now).oldWarning).toBeNull();
    expect(r2Text(at(18), null, now).oldWarning).toBe("Diese Sicherung ist 12 Tage alt.");
  });
});
