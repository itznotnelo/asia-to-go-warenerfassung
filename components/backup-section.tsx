"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  backupReasonText,
  backupState,
  formatBackupTime,
  type BackupFailureReason,
  type BackupStatusInput,
} from "@/lib/backup-state";
import { RESTORE_TEXT } from "@/lib/restore-text";
import { RestoreDialog, type RestoreApi } from "@/components/restore-dialog";

// Shapes as sent by electron/src/backup-ipc.ts (structured clone, plain data).
interface BackupStatusResponse {
  status: BackupStatusInput & { copyLastOkAt: string | null; copyLastError: string | null };
  newest: { manifest: { createdAt: string } | null } | null;
  copyFolder: string | null;
  busy: boolean;
}

type CreateResponse = {
  result: { ok: true; backup: { manifest: { createdAt: string } } } | { ok: false; reason: BackupFailureReason };
  copy: { ok: boolean } | null;
};

type ChooseResponse = { ok: true; folder: string } | { ok: false; canceled: boolean; message?: string };

interface BackupApi extends RestoreApi {
  status(): Promise<BackupStatusResponse>;
  create(): Promise<CreateResponse>;
  chooseCopyFolder(): Promise<ChooseResponse>;
  removeCopyFolder(): Promise<{ removed: boolean }>;
  openFolder(): Promise<string>;
}

declare global {
  interface Window {
    backupApi?: BackupApi;
  }
}

const TONE_CLASS = {
  ok: "",
  warning: "rounded-md border border-orange-500/60 bg-orange-500/10 px-3 py-2",
  error: "rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2",
} as const;

/** Einstellungen "Datensicherung" (files' UX 1.2-1.5). Only exists in the desktop app, where the preload provides backupApi. */
export function BackupSection() {
  const [api, setApi] = useState<BackupApi | null>(null);
  const [info, setInfo] = useState<BackupStatusResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const refresh = useCallback(async (backupApi: BackupApi) => {
    const next = await backupApi.status();
    setInfo(next);
    setRunning(next.busy);
  }, []);

  useEffect(() => {
    if (!window.backupApi) return;
    setApi(window.backupApi);
    void refresh(window.backupApi);
  }, [refresh]);

  if (!api || !info) return null;

  const now = new Date();
  const state = backupState(info.status, info.newest?.manifest?.createdAt ?? null, now);

  async function handleCreate() {
    if (!api) return;
    setRunning(true);
    setResult(null);
    try {
      const { result: r, copy } = await api.create();
      if (r.ok) {
        const when = formatBackupTime(new Date(r.backup.manifest.createdAt), new Date());
        setResult({ tone: "ok", text: `Gesichert: ${when}.${copy?.ok ? " Zweite Kopie gespeichert." : ""}` });
      } else {
        setResult({ tone: "error", text: `Sicherung hat nicht geklappt: ${backupReasonText(r.reason)}. Ältere Sicherungen sind noch da.` });
      }
    } finally {
      await refresh(api);
    }
  }

  async function handleChoose() {
    if (!api) return;
    const r = await api.chooseCopyFolder();
    if (!r.ok && r.message) setResult({ tone: "error", text: r.message });
    await refresh(api);
  }

  async function handleRemove() {
    if (!api) return;
    await api.removeCopyFolder();
    await refresh(api);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="backup-title">
      <h2 id="backup-title" className="text-lg font-semibold">
        Datensicherung
      </h2>

      <p className={cn("flex items-start gap-2 text-sm", TONE_CLASS[state.tone])} role={state.tone === "ok" ? undefined : "alert"}>
        {state.tone === "ok" && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-sm bg-green-600" />}
        {state.text}
      </p>

      <p className="flex items-center gap-3 text-sm text-muted-foreground">
        Gespeichert auf diesem PC.
        <Button type="button" variant="outline" size="sm" onClick={() => void api.openFolder()}>
          Ordner öffnen
        </Button>
      </p>

      {info.copyFolder ? (
        <p className="text-sm text-muted-foreground">
          Zweite Kopie: {info.copyFolder}
          {info.status.copyLastOkAt ? `, ${formatBackupTime(new Date(info.status.copyLastOkAt), now)}` : ""}
        </p>
      ) : (
        <p className={cn("text-sm", TONE_CLASS.warning)}>Zweite Kopie: keine. Wenn der PC kaputtgeht, sind die Daten weg.</p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="button" className="self-start" disabled={running || !state.canCreate} onClick={() => void handleCreate()}>
          {running ? "Sicherung läuft …" : "Datensicherung erstellen"}
        </Button>
        {result && (
          <p role="status" className={cn("text-sm", result.tone === "ok" ? "text-green-700" : "text-destructive")}>
            {result.text}
          </p>
        )}
      </div>

      <p className="flex items-center gap-3 text-sm text-muted-foreground">
        Zweite Kopie:
        <Button type="button" variant="outline" size="sm" onClick={() => void handleChoose()}>
          Ordner wählen …
        </Button>
        {info.copyFolder && (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleRemove()}>
            Entfernen
          </Button>
        )}
      </p>

      <div className="flex flex-col gap-2 border-t pt-3">
        <h3 className="font-semibold">{RESTORE_TEXT.sectionTitle}</h3>
        <p className="text-sm text-muted-foreground">{RESTORE_TEXT.sectionHint}</p>
        <Button type="button" variant="outline" className="self-start" disabled={running} onClick={() => setRestoreOpen(true)}>
          {RESTORE_TEXT.open}
        </Button>
      </div>
      {restoreOpen && <RestoreDialog api={api} copyFolder={info.copyFolder} onClose={() => setRestoreOpen(false)} />}
    </section>
  );
}
