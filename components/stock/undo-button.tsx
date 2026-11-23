"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { undoStockMovementAction } from "@/app/stock/actions";

/** "Rückgängig" for the newest movement of an article: books the reversal, then reloads the page data. */
export function UndoButton({ movementId, label = "Rückgängig" }: { movementId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function undo() {
    setError(null);
    startTransition(async () => {
      const result = await undoStockMovementAction({ movementId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" className="h-11 px-4" disabled={pending} onClick={undo}>
        {pending ? "Wird rückgängig gemacht …" : label}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
