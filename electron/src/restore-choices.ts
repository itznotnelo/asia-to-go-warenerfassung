// Rows for restore screen R1 (files' UX #3067 section 2). Pure, no electron
// import. The renderer only ever gets ids; main maps an id back to a folder,
// so backup:restore cannot be pointed at an arbitrary path.

import type { BackupListEntry } from "./backup/store";
import type { Pool } from "./backup/types";

export interface RestoreChoice {
  id: string;
  name: string;
  pool: Pool;
  // ISO time from the manifest; null when damaged.
  createdAt: string | null;
  products: number | null;
  images: number | null;
  // "local" = Dieser PC, "copy" = second-copy folder, "external" = picked by hand.
  location: "local" | "copy" | "external";
  // Manifest missing/unreadable or not verified at creation: greyed, not selectable.
  damaged: boolean;
}

export function isVerified(entry: BackupListEntry): boolean {
  const v = entry.manifest?.verified;
  return !!v && v.pgRestoreList && v.pgRestoreFullRead && v.zipTest;
}

export function toChoice(entry: BackupListEntry, location: RestoreChoice["location"], id: string): RestoreChoice {
  const m = entry.manifest;
  return {
    id,
    name: entry.name,
    pool: m?.kind ?? entry.pool,
    createdAt: m?.createdAt ?? null,
    products: m ? (m.rowCounts.Product ?? 0) : null,
    images: m ? (m.rowCounts.ProductImage ?? 0) : null,
    location,
    damaged: !isVerified(entry),
  };
}

/**
 * Local backups plus the second copy, newest first. A backup in both places
 * shows once, as "Dieser PC". Returns the rows and the id -> folder map.
 */
export function buildRestoreChoices(
  local: BackupListEntry[],
  copy: BackupListEntry[],
): { choices: RestoreChoice[]; dirs: Map<string, string> } {
  const dirs = new Map<string, string>();
  const rows: { entry: BackupListEntry; location: "local" | "copy" }[] = [];
  const seen = new Set<string>();
  for (const entry of local) {
    seen.add(`${entry.pool}/${entry.name}`);
    rows.push({ entry, location: "local" });
  }
  for (const entry of copy) {
    if (!seen.has(`${entry.pool}/${entry.name}`)) rows.push({ entry, location: "copy" });
  }
  rows.sort((a, b) => (a.entry.name < b.entry.name ? 1 : a.entry.name > b.entry.name ? -1 : 0));
  const choices = rows.map(({ entry, location }) => {
    const id = `${location}:${entry.pool}/${entry.name}`;
    dirs.set(id, entry.dir);
    return toChoice(entry, location, id);
  });
  return { choices, dirs };
}

/** Newest selectable row; from the update-failure path the newest "Vor Update" one. */
export function preselectedChoice(choices: RestoreChoice[], preferPreMigrate = false): string | null {
  const ok = choices.filter((c) => !c.damaged);
  const pick = (preferPreMigrate ? ok.find((c) => c.pool === "pre-migrate") : undefined) ?? ok[0];
  return pick?.id ?? null;
}
