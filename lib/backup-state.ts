// "Letzte Sicherung" states for Einstellungen (files' UX spec #3067, 1.3).
// Pure: the Electron main process sends status.json + the newest verified
// backup through window.backupApi, this turns them into tone + German text.

export type BackupFailureReason = "diskFull" | "corrupt" | "interrupted" | "toolMissing" | "unknown";

export interface BackupStatusInput {
  lastError: BackupFailureReason | null;
  consecutiveFailures: number;
  toolProblem: string | null;
}

export interface BackupState {
  tone: "ok" | "warning" | "error";
  text: string;
  /** Broken tool: the "Datensicherung erstellen" button is disabled. */
  canCreate: boolean;
}

const REASON_TEXT: Record<BackupFailureReason, string> = {
  diskFull: "zu wenig Speicher auf dem PC",
  corrupt: "Sicherung war fehlerhaft und wurde gelöscht",
  interrupted: "App wurde während der Sicherung geschlossen",
  toolMissing: "Sicherungsprogramm fehlt",
  unknown: "unbekannter Fehler",
};

export function backupReasonText(reason: BackupFailureReason): string {
  return REASON_TEXT[reason];
}

const WEEKDAYS =["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DAY_MS = 86_400_000;
const OLD_AFTER_MS = 2 * DAY_MS;
const TOO_OLD_AFTER_MS = 7 * DAY_MS;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function calendarDaysBetween(at: Date, now: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(at)) / DAY_MS);
}

/** Spec rule 0: "heute, 02:15" / "gestern, 02:15" / "Mo 27.10.2026, 02:15 (vor 3 Tagen)". */
export function formatBackupTime(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = calendarDaysBetween(at, now);
  if (days === 0) return `heute, ${time}`;
  if (days === 1) return `gestern, ${time}`;
  const date = `${WEEKDAYS[at.getDay()]} ${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}, ${time}`;
  return days > 2 ? `${date} (vor ${days} Tagen)` : date;
}

export function backupState(status: BackupStatusInput, newestCreatedAt: string | null, now: Date): BackupState {
  if (status.toolProblem) {
    return { tone: "error", text: "Datensicherung nicht möglich. Bitte HQ melden.", canCreate: false };
  }
  if (!newestCreatedAt) {
    return { tone: "error", text: "Noch keine Datensicherung. Die Daten sind nur auf diesem PC.", canCreate: true };
  }
  const newest = new Date(newestCreatedAt);
  const age = now.getTime() - newest.getTime();
  const last = `Letzte Sicherung: ${formatBackupTime(newest, now)}`;

  if (age > TOO_OLD_AFTER_MS || status.consecutiveFailures >= 2) {
    return { tone: "error", text: `${last}. Die Daten sind nicht gesichert.`, canCreate: true };
  }
  if (age > OLD_AFTER_MS) {
    return { tone: "warning", text: `${last}. Bitte heute sichern.`, canCreate: true };
  }
  if (status.consecutiveFailures >= 1 && status.lastError) {
    return {
      tone: "warning",
      text: `${last}. Die Sicherung von heute hat nicht geklappt: ${REASON_TEXT[status.lastError]}.`,
      canCreate: true,
    };
  }
  return { tone: "ok", text: last, canCreate: true };
}
