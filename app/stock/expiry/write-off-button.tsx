"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import { WASTE_REASONS, wasteReasonLabel, type WasteReason } from "@/lib/stock/movement-rules";
import { writeOffLotAction } from "@/app/stock/actions";
import { cn } from "@/lib/utils";

/** One click opens the reason, the second books the write-off of what is left of the lot. */
export function WriteOffButton({ lotId, label, defaultReason }: { lotId: string; label: string; defaultReason: WasteReason }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<WasteReason>(defaultReason);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setOpen(true)}>
        Abschreiben
      </Button>
    );
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await writeOffLotAction({ lotId, wasteReason: reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{label} abschreiben</span>
      <select aria-label="Grund" value={reason} onChange={(event) => setReason(event.target.value as WasteReason)} className={cn(inputClass(), "w-40")}>
        {WASTE_REASONS.map((value) => (
          <option key={value} value={value}>
            {wasteReasonLabel(value)}
          </option>
        ))}
      </select>
      <Button type="button" variant="destructive" className="h-11 px-4" disabled={pending} onClick={confirm}>
        {pending ? "Bucht …" : "Ja, abschreiben"}
      </Button>
      <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setOpen(false)}>
        Nein
      </Button>
      {error && <span className="w-full text-sm text-destructive">{error}</span>}
    </div>
  );
}
