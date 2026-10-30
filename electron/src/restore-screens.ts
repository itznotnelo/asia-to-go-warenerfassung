// Restore screens R3/R4 (files' UX #3067 section 2). They run in a local page
// in the main window, because the Next server is stopped. Pure, no electron
// import, so vitest checks every wording and every outcome.

import type { RestoreResult, RestoreStep } from "./backup/restore";
import { whenText } from "./backup-dialogs";

export const RESTORE_STEPS: { step: RestoreStep; label: string }[] = [
  { step: "verify", label: "Sicherung prüfen" },
  { step: "safety", label: "Heutigen Stand sichern" },
  { step: "db", label: "Daten zurückholen" },
  { step: "images", label: "Bilder zurückholen" },
  { step: "check", label: "Alles prüfen" },
];

// restoreBackup() unpacks images before it drops the database.
const ENGINE_ORDER: RestoreStep[] = ["verify", "safety", "images", "db", "check"];

export type StepState = "done" | "running" | "todo";

/** R3 marks: everything the engine finished before `current` is done. */
export function stepStates(current: RestoreStep): Record<RestoreStep, StepState> {
  const at = ENGINE_ORDER.indexOf(current);
  const out = {} as Record<RestoreStep, StepState>;
  ENGINE_ORDER.forEach((s, i) => {
    out[s] = i < at ? "done" : i === at ? "running" : "todo";
  });
  return out;
}

export const R3_TITLE = "Daten werden zurückgeholt";
export const R3_DO_NOT_CLOSE = "PC nicht ausschalten und App nicht schliessen.";
export const REPUBLISH_FAILED = "Senden hat nicht geklappt. Später in Einstellungen > Website-Abgleich nochmals versuchen.";

export type RestoreAction = "later" | "republish" | "copyReport" | "close" | "openFolder" | "chooseOther";

export interface RestoreScreen {
  kind: "ok" | "failed" | "damaged" | "fatal";
  title: string;
  lines: string[];
  // Shown only on "ok" when the website sync is configured (storage 4.9).
  sync: { paused: string; explain: string } | null;
  buttons: { action: RestoreAction; label: string; primary?: boolean }[];
  // Button that gets focus (the safe one, scanner rule 0).
  focus: RestoreAction;
  // false = keep Next stopped (restore.fatal).
  startApp: boolean;
}

const COPY_REPORT = { action: "copyReport" as const, label: "Fehlerbericht kopieren" };

/** Map the engine result to R4a / R4b / damaged / fatal. */
export function restoreOutcome(
  result: RestoreResult,
  backupCreatedAt: string,
  now: Date,
  syncConfigured: boolean,
): RestoreScreen {
  const when = whenText(new Date(backupCreatedAt), now);
  if (result.ok) {
    const c = result.manifest.rowCounts;
    return {
      kind: "ok",
      title: `Fertig. Die Daten von ${when} sind zurück.`,
      lines: [
        `${c.Product ?? 0} Artikel, ${c.ProductImage ?? 0} Bilder.`,
        'Falls es die falsche Sicherung war: nochmals "Daten zurückholen" und "Stand vor dem Zurückholen" wählen.',
        ...(syncConfigured ? [`Bestellungen nach ${when} fehlen hier. Sie sind im Shop-Backend noch da.`] : []),
      ],
      sync: syncConfigured
        ? {
            paused: "Website-Abgleich ist angehalten.",
            explain:
              "Der Online-Shop hat vielleicht neuere Artikel als dieser PC. Damit der Shop wieder dasselbe zeigt, die zurückgeholten Artikel neu an die Website senden.",
          }
        : null,
      buttons: syncConfigured
        ? [
            { action: "later", label: "Später" },
            { action: "republish", label: "Artikel neu an die Website senden", primary: true },
          ]
        : [{ action: "later", label: "OK", primary: true }],
      focus: "later",
      startApp: true,
    };
  }
  if (result.step === "verify") {
    return {
      kind: "damaged",
      title: "Zurückholen hat nicht geklappt.",
      lines: ["Diese Sicherung ist beschädigt. Bitte eine andere wählen."],
      sync: null,
      buttons: [{ action: "chooseOther", label: "Andere wählen", primary: true }],
      focus: "chooseOther",
      startApp: true,
    };
  }
  // Nothing changed, or the pre-restore state is back: "nichts verloren" is true.
  if (!result.changed || result.rolledBack) {
    return {
      kind: "failed",
      title: "Zurückholen hat nicht geklappt.",
      lines: ["Es ist nichts verloren: der Stand von vorher ist wieder da.", `Grund: ${reasonFor(result.step)}`],
      sync: null,
      buttons: [COPY_REPORT, { action: "close", label: "Schliessen", primary: true }],
      focus: "close",
      startApp: true,
    };
  }
  return {
    kind: "fatal",
    title: "Die Daten konnten nicht zurückgeholt werden. Bitte die App nicht mehr benutzen und HQ anrufen.",
    lines: [],
    sync: null,
    buttons: [{ action: "openFolder", label: "Ordner öffnen" }, COPY_REPORT],
    focus: "openFolder",
    startApp: false,
  };
}

function reasonFor(step: RestoreStep | "migrate"): string {
  switch (step) {
    case "safety":
      return "Der heutige Stand konnte nicht gesichert werden";
    case "images":
      return "Die Bilder der Sicherung konnten nicht ausgepackt werden";
    case "migrate":
      return "Die Daten konnten nicht an diese Version angepasst werden";
    default:
      return "Die Daten der Sicherung konnten nicht eingespielt werden";
  }
}

/** [Fehlerbericht kopieren]: app version, step, error, backup folder (for a WhatsApp to HQ). */
export function restoreReport(appVersion: string, backupDir: string, result: RestoreResult, at: Date): string {
  const step = result.ok ? "ok" : result.step;
  const error = result.ok ? "-" : result.error;
  return [
    "Asia To Go: Zurückholen",
    `Zeit: ${at.toISOString()}`,
    `Version: ${appVersion}`,
    `Sicherung: ${backupDir}`,
    `Schritt: ${step}`,
    `Fehler: ${error}`,
  ].join("\n");
}
