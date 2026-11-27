"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RESTORE_TEXT,
  countsText,
  r2Text,
  restoreKindText,
  restoreLocationText,
  restoreWhen,
  type RestorePool,
} from "@/lib/restore-text";

// Shape as sent by electron/src/restore-choices.ts.
export interface RestoreChoice {
  id: string;
  name: string;
  pool: RestorePool;
  createdAt: string | null;
  products: number | null;
  images: number | null;
  location: "local" | "copy" | "external";
  damaged: boolean;
}

export interface RestoreApi {
  restoreChoices(): Promise<{ choices: RestoreChoice[]; preselected: string | null }>;
  pickExternalFolder(): Promise<{ ok: true; choice: RestoreChoice } | { ok: false; canceled: boolean; message?: string }>;
  currentCounts(): Promise<{ products: number; images: number } | null>;
  // Main takes over the window from here (R3/R4), so this never resolves on success.
  restore(id: string): Promise<void>;
}

/**
 * Restore screens R1 (choose) and R2 (confirm), files' UX #3067 section 2.
 * No <form>: the scanner types Enter, and Enter must never reach the red button.
 */
export function RestoreDialog({ api, copyFolder, onClose }: { api: RestoreApi; copyFolder: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [choices, setChoices] = useState<RestoreChoice[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ choice: RestoreChoice; current: { products: number; images: number } | null } | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    void api.restoreChoices().then((r) => {
      setChoices(r.choices);
      setSelected(r.preselected);
    });
  }, [api]);

  // Default focus: [Abbrechen] on both screens (spec R1/R2).
  useEffect(() => {
    cancelRef.current?.focus();
  }, [choices, confirm]);

  const chosen = choices?.find((c) => c.id === selected) ?? null;
  const now = new Date();

  async function handleExternal() {
    setMessage(null);
    const r = await api.pickExternalFolder();
    if (r.ok) {
      setChoices((prev) => [r.choice, ...(prev ?? []).filter((c) => c.id !== r.choice.id)]);
      setSelected(r.choice.damaged ? null : r.choice.id);
    } else if (r.message) {
      setMessage(r.message);
    }
  }

  async function handleNext() {
    if (!chosen || chosen.damaged) return;
    setConfirm({ choice: chosen, current: await api.currentCounts() });
    setUnderstood(false);
  }

  async function handleRestore() {
    if (!confirm || !understood) return;
    setStarting(true);
    // On success main navigates away; resolving here means it refused (busy).
    await api.restore(confirm.choice.id);
    setStarting(false);
  }

  const r2 =
    confirm && confirm.choice.createdAt
      ? r2Text(
          { createdAt: confirm.choice.createdAt, products: confirm.choice.products ?? 0, images: confirm.choice.images ?? 0 },
          confirm.current,
          now,
        )
      : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="restore-title"
      onClose={onClose}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-md border bg-background p-5 text-foreground backdrop:bg-black/50"
    >
      {!r2 ? (
        <div className="flex flex-col gap-4">
          <h2 id="restore-title" className="text-lg font-semibold">
            {RESTORE_TEXT.r1Title}
          </h2>

          {choices && choices.length === 0 ? (
            <p className="text-sm">{RESTORE_TEXT.r1Empty}</p>
          ) : (
            <fieldset className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              <legend className="sr-only">{RESTORE_TEXT.r1Title}</legend>
              {(choices ?? []).map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    "grid grid-cols-[auto_11rem_1fr_11rem_8rem] items-center gap-3 rounded-sm px-2 py-1.5 text-sm",
                    c.damaged ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="restore-choice"
                    value={c.id}
                    disabled={c.damaged}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                  />
                  <span>{c.createdAt ? restoreWhen(new Date(c.createdAt), now) : c.name}</span>
                  <span>{c.damaged ? RESTORE_TEXT.r1Damaged : restoreKindText(c.pool)}</span>
                  <span>{c.products !== null && c.images !== null ? countsText(c.products, c.images) : ""}</span>
                  <span className="truncate">{restoreLocationText(c.location, copyFolder)}</span>
                </label>
              ))}
            </fieldset>
          )}

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void handleExternal()}>
              {RESTORE_TEXT.r1External}
            </Button>
            <span className="flex-1" />
            {choices && choices.length === 0 ? (
              <Button ref={cancelRef} type="button" variant="outline" onClick={() => ref.current?.close()}>
                Schliessen
              </Button>
            ) : (
              <>
                <Button ref={cancelRef} type="button" variant="outline" onClick={() => ref.current?.close()}>
                  Abbrechen
                </Button>
                <Button type="button" disabled={!chosen || chosen.damaged} onClick={() => void handleNext()}>
                  Weiter
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 id="restore-title" className="text-lg font-semibold">
            {r2.title}
          </h2>
          <p className="text-sm">{r2.body}</p>
          <p className="flex flex-col text-sm">
            <span>{r2.now}</span>
            <span>{r2.after}</span>
          </p>
          <p className="text-sm text-muted-foreground">{r2.safety}</p>
          {r2.oldWarning && (
            <p className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm">{r2.oldWarning}</p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            {RESTORE_TEXT.r2Check}
          </label>
          <div className="flex justify-end gap-2">
            <Button ref={cancelRef} type="button" variant="outline" disabled={starting} onClick={() => ref.current?.close()}>
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={!understood || starting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleRestore()}
            >
              {RESTORE_TEXT.r2Confirm}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
