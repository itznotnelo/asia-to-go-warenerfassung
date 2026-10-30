"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveErrorBox } from "@/components/save-error-box";
import { SHOP_DELETE_GRACE_MINUTES } from "@/lib/archive-grace";
import { saveErrorLines, settle } from "@/lib/save-error";
import { deleteProduct, purgeProduct, restoreProduct } from "../actions";

// Review should #34: Löschen lives in its own section below the form, far
// from Speichern, and asks in-page (name + SKU) instead of window.confirm.

/** "Weitere Aktionen" for an active article: a two-step, soft "Löschen". */
export function DeleteSection({ id, nameDe, sku }: { id: string; nameDe: string; sku: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[] | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await settle(() => deleteProduct(id));
    if (result.ok) {
      router.push(`/products?deleted=${encodeURIComponent(id)}`);
      return;
    }
    setBusy(false);
    setError(saveErrorLines(result));
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-medium text-muted-foreground">Weitere Aktionen</h2>
      {!confirming ? (
        <div>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            Artikel löschen …
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm">
            <span className="font-medium">„{nameDe}“</span> <span className="font-numeric text-muted-foreground">({sku})</span>{" "}
            löschen? Der Artikel verschwindet aus der Liste und nach {SHOP_DELETE_GRACE_MINUTES} Minuten von der
            Website. Unter «Gelöschte Artikel» kann er jederzeit wiederhergestellt werden.
          </p>
          <SaveErrorBox lines={error} />
          <div className="flex items-center gap-3">
            <Button type="button" variant="destructive" disabled={busy} onClick={handleDelete}>
              {busy ? "Löscht …" : "Ja, löschen"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

interface ArchivedPanelProps {
  id: string;
  nameDe: string;
  sku: string;
  /** Pre-formatted on the server ("30.10.2026, 17:05"). */
  archivedAtLabel: string;
  shopDeleteDueLabel: string;
  gracePeriodOver: boolean;
}

/** Banner on a "gelöschter" article: Wiederherstellen, and the second step "Endgültig löschen". */
export function ArchivedPanel({ id, nameDe, sku, archivedAtLabel, shopDeleteDueLabel, gracePeriodOver }: ArchivedPanelProps) {
  const router = useRouter();
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[] | null>(null);

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, onOk: () => void) {
    setBusy(true);
    setError(null);
    const result = await settle(action);
    setBusy(false);
    if (result.ok) {
      onOk();
    } else {
      setError(saveErrorLines(result));
    }
  }

  return (
    <section role="status" className="flex flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <p className="text-sm">
        Gelöscht am {archivedAtLabel}.{" "}
        {gracePeriodOver ? "Nicht mehr auf der Website." : `Bis ${shopDeleteDueLabel} noch auf der Website.`}
      </p>
      <SaveErrorBox lines={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={() => run(() => restoreProduct(id), () => router.refresh())}>
          Wiederherstellen
        </Button>
        {!confirmingPurge ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !gracePeriodOver}
            title={gracePeriodOver ? undefined : `Erst ab ${shopDeleteDueLabel} möglich`}
            onClick={() => setConfirmingPurge(true)}
          >
            Endgültig löschen …
          </Button>
        ) : (
          <>
            <span className="text-sm">
              „{nameDe}“ <span className="font-numeric text-muted-foreground">({sku})</span> mit allen Fotos endgültig löschen? Das
              kann nicht rückgängig gemacht werden.
            </span>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => purgeProduct(id), () => router.push("/products?archived=true"))}
            >
              {busy ? "Löscht …" : "Ja, endgültig löschen"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmingPurge(false)}>
              Abbrechen
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
