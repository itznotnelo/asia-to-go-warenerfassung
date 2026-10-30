// Native dialog texts for the backup engine (files' UX spec #3067, sections 1.3/1.4/3).
// Pure functions, no electron import, so vitest can check every wording.
// Papa's one-pager quotes these labels word for word: tell files before changing one.

import path from "node:path";
import type { FailureReason, Manifest } from "./backup/types";
import { MESSAGE_FAILED } from "./backup/encoding-migration";

export interface DialogSpec {
  type: "info" | "warning" | "error" | "question";
  title: string;
  message: string;
  detail?: string;
  buttons: string[];
  // The scanner types Enter, so Enter (defaultId) and Esc (cancelId) always
  // hit the safe button (spec rule 0).
  defaultId: number;
  cancelId: number;
}

const REASON_TEXT: Record<FailureReason, string> = {
  diskFull: "zu wenig Speicher auf dem PC",
  corrupt: "Sicherung war fehlerhaft und wurde gelöscht",
  interrupted: "App wurde während der Sicherung geschlossen",
  toolMissing: "Sicherungsprogramm fehlt",
  unknown: "unbekannter Fehler",
};

export function reasonText(reason: FailureReason): string {
  return REASON_TEXT[reason];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "heute, 07:58", "gestern, 02:14", else "28.10., 07:58" (local time of the shop PC). */
export function whenText(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `heute, ${time}`;
  if (days === 1) return `gestern, ${time}`;
  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}., ${time}`;
}

/** 3.3: the pre-update backup failed, so the migration never ran. */
export function blockedDialog(reason: FailureReason): DialogSpec {
  return {
    type: "warning",
    title: "Update wartet",
    message: "Update wartet",
    detail: `Das Update wurde nicht eingespielt, weil die Datensicherung davor nicht geklappt hat (${reasonText(reason)}). Die Daten sind unverändert.`,
    buttons: ["Nochmals versuchen", "Schliessen"],
    defaultId: 1,
    cancelId: 1,
  };
}

/** 3.1 (pre-update backup exists) or 3.2 (none readable: only "call HQ"). */
export function migrateFailedDialog(backup: Pick<Manifest, "createdAt"> | null, now: Date): DialogSpec {
  if (!backup) {
    return {
      type: "error",
      title: "Update hat nicht geklappt",
      message: "Update hat nicht geklappt",
      detail: "Bitte HQ anrufen. Die Daten nicht anfassen.",
      buttons: ["Schliessen"],
      defaultId: 0,
      cancelId: 0,
    };
  }
  const when = whenText(new Date(backup.createdAt), now);
  const time = when.split(", ")[1];
  return {
    type: "error",
    title: "Update hat nicht geklappt",
    message: "Update hat nicht geklappt",
    detail:
      `Die neue Version konnte die Daten nicht einrichten.\nDie Daten sind gesichert: Stand ${when}, direkt vor dem Update.\n\n` +
      "Empfohlen: diesen Stand zurückholen. Danach wartet die App auf eine reparierte Version und installiert sie, sobald sie da ist.",
    buttons: [`Stand von ${time} zurückholen`, "Schliessen, nichts ändern"],
    defaultId: 1,
    cancelId: 1,
  };
}

/** After the 3.1 restore succeeded. */
export function restoredWaitingDialog(manifest: Pick<Manifest, "createdAt" | "rowCounts">, now: Date): DialogSpec {
  const products = manifest.rowCounts.Product ?? 0;
  return {
    type: "info",
    title: "Asia To Go",
    message: `Die Daten von ${whenText(new Date(manifest.createdAt), now)} sind zurück (${products} Artikel).`,
    detail: "Die App startet wieder, sobald die reparierte Version da ist. Bis dahin Ware auf Papier notieren.",
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
  };
}

export function waitingForFixDialog(): DialogSpec {
  return {
    type: "info",
    title: "Asia To Go",
    message: "Die App wartet auf eine reparierte Version. Die Daten sind sicher.",
    buttons: ["Schliessen"],
    defaultId: 0,
    cancelId: 0,
  };
}

/** WIN1252 -> UTF8 migration failed or a crashed one is unclear (storage #3112). Old data is never written to. */
export function encodingFailedDialog(): DialogSpec {
  return {
    type: "error",
    title: "Asia To Go",
    message: MESSAGE_FAILED,
    buttons: ["Schliessen"],
    defaultId: 0,
    cancelId: 0,
  };
}

function isInsideDir(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** 1.5 checks 1 and 2 for a picked second-copy folder; null = accepted. */
export function copyFolderRefusal(chosen: string, userDataDir: string, writable: boolean): string | null {
  if (isInsideDir(chosen, userDataDir)) return "Dieser Ordner gehört zur App. Bitte einen anderen wählen.";
  if (!writable) return "In diesen Ordner kann die App nicht schreiben.";
  return null;
}

/** 1.5 [Entfernen]: forgets the setting only, never deletes on the target. */
export function removeCopyFolderDialog(): DialogSpec {
  return {
    type: "question",
    title: "Asia To Go",
    message: "Keine zweite Kopie mehr machen? Die Sicherungen im Ordner bleiben dort.",
    buttons: ["Abbrechen", "Nicht mehr kopieren"],
    defaultId: 0,
    cancelId: 0,
  };
}

/** R3: closing while a restore runs is not possible. */
export function restoreBlockQuitDialog(): DialogSpec {
  return {
    type: "warning",
    title: "Asia To Go",
    message: "Bitte warten, bis das Zurückholen fertig ist.",
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
  };
}

/** 1.4: closing while a backup runs. */
export function quitWhileBackupDialog(): DialogSpec {
  return {
    type: "warning",
    title: "Asia To Go",
    message: "Datensicherung läuft noch. Trotzdem schliessen?",
    buttons: ["Warten", "Schliessen"],
    defaultId: 0,
    cancelId: 0,
  };
}
