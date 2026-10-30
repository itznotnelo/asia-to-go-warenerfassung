"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Review should #29, texts from design's copy sheet #3065. Esc or the backdrop means Weiter bearbeiten. */
export function DiscardDialog({ onSave, onDiscard, onBack }: { onSave: () => void; onDiscard: () => void; onBack: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="discard-title"
      onClose={onBack}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border bg-background p-5 text-foreground backdrop:bg-black/50"
    >
      <h2 id="discard-title" className="text-lg font-semibold">
        Ungespeicherte Eingaben verwerfen?
      </h2>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Weiter bearbeiten
        </Button>
        <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={onDiscard}>
          Verwerfen
        </Button>
        <Button type="button" autoFocus onClick={onSave}>
          Speichern
        </Button>
      </div>
    </dialog>
  );
}
