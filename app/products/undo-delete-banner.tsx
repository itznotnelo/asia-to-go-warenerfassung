"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveErrorLines, settle } from "@/lib/save-error";
import { restoreProduct } from "./actions";

/** How long the "Rückgängig" toast stays after Löschen (review should #34). Later: "Gelöschte Artikel" → Wiederherstellen. */
export const UNDO_VISIBLE_MS = 10_000;

export function UndoDeleteBanner({ id, nameDe }: { id: string; nameDe: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), UNDO_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [id]);

  async function handleUndo() {
    setBusy(true);
    setError(null);
    const result = await settle(() => restoreProduct(id));
    setBusy(false);
    if (!result.ok) {
      setError(saveErrorLines(result).join(" "));
      return;
    }
    router.replace(`/products/${encodeURIComponent(id)}`);
  }

  // An error stays visible even after the timeout, otherwise a failed undo would vanish silently.
  if (!visible && !error) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3 text-sm">
      <span>
        „{nameDe}“ gelöscht.
        {error && <span className="ml-2 text-destructive">{error}</span>}
      </span>
      <Button type="button" variant="outline" disabled={busy} onClick={handleUndo}>
        {busy ? "Stellt wieder her …" : "Rückgängig"}
      </Button>
    </div>
  );
}
