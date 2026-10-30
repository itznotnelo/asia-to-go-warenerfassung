// German texts for restore screens R1/R2 (files' UX spec #3067, section 2).
// Pure, so every wording is checked in vitest. Papa's one-pager
// (daten-zurueckholen.pdf) quotes these: tell files before changing one.

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DAY_MS = 86_400_000;

export type RestorePool = "daily" | "pre-migrate" | "manual" | "pre-restore" | "encoding-migration";

const KIND_TEXT: Record<RestorePool, string> = {
  daily: "Automatisch",
  manual: "Von Hand",
  "pre-migrate": "Vor Update",
  "pre-restore": "Stand vor dem Zurückholen",
  "encoding-migration": "Vor der Umstellung",
};

export function restoreKindText(pool: RestorePool): string {
  return KIND_TEXT[pool];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function calendarDaysBetween(at: Date, now: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(at)) / DAY_MS);
}

/** R1/R2 time: "heute, 02:15" / "gestern, 02:14" / "Di 28.10.2026, 07:58". */
export function restoreWhen(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = calendarDaysBetween(at, now);
  if (days === 0) return `heute, ${time}`;
  if (days === 1) return `gestern, ${time}`;
  return `${WEEKDAYS[at.getDay()]} ${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}, ${time}`;
}

export function countsText(products: number, images: number): string {
  return `${products} Artikel, ${images} Bilder`;
}

/** "Dieser PC", the second-copy folder, or the folder picked by hand. */
export function restoreLocationText(location: "local" | "copy" | "external", copyFolder: string | null): string {
  if (location === "local") return "Dieser PC";
  if (location === "copy") return copyFolder ?? "Zweite Kopie";
  return "Anderer Ordner";
}

export interface R2Text {
  title: string;
  body: string;
  now: string;
  after: string;
  safety: string;
  oldWarning: string | null;
}

/** Screen R2. current = live counts, null = database not readable. */
export function r2Text(
  backup: { createdAt: string; products: number; images: number },
  current: { products: number; images: number } | null,
  now: Date,
): R2Text {
  const at = new Date(backup.createdAt);
  const when = restoreWhen(at, now);
  const days = calendarDaysBetween(at, now);
  return {
    title: `Daten von ${when} zurückholen?`,
    body: `Alles, was nach ${when} erfasst oder geändert wurde, wird überschrieben und ist danach weg: Artikel, Preise, Bilder und Bestellungen.`,
    now: current ? `Jetzt: ${countsText(current.products, current.images)}` : "Jetzt: nicht lesbar",
    after: `Nach dem Zurückholen: ${countsText(backup.products, backup.images)}`,
    safety: current
      ? "Der heutige Stand wird vorher automatisch gesichert. Falls es die falsche Sicherung war, lässt er sich wieder zurückholen."
      : "Der heutige Stand kann nicht mehr gesichert werden.",
    oldWarning: days > 7 ? `Diese Sicherung ist ${days} Tage alt.` : null,
  };
}

export const RESTORE_TEXT = {
  sectionTitle: "Daten zurückholen",
  sectionHint: "Falls Daten fehlen oder falsch sind: frühere Sicherung zurückholen.",
  open: "Daten zurückholen …",
  r1Title: "Welche Sicherung zurückholen?",
  r1External: "Andere Sicherung suchen …",
  r1Damaged: "beschädigt",
  r1Empty: "Es gibt noch keine Sicherung zum Zurückholen.",
  r2Check: "Ich habe verstanden, dass neuere Daten überschrieben werden.",
  r2Confirm: "Überschreiben und zurückholen",
} as const;
