"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import { parseSafetyBuffer } from "@/lib/stock/availability";
import { saveSafetyBufferAction } from "@/app/stock/actions";
import { cn } from "@/lib/utils";

/** Webshop safety buffer: tracked articles show online only while stock is above it. */
export function SafetyBufferForm({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const buffer = parseSafetyBuffer(value);
    if (buffer === null) {
      setMessage({ ok: false, text: "Bitte eine ganze Zahl von 0 bis 9999 eingeben." });
      return;
    }
    startTransition(async () => {
      const result = await saveSafetyBufferAction({ shopSafetyBuffer: buffer });
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      const changed = result.data.changed;
      setMessage({ ok: true, text: changed === 0 ? "Gespeichert." : `Gespeichert. ${changed} Artikel im Webshop angepasst.` });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Sicherheitsbestand (Stück)
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" className={cn(inputClass(), "font-numeric w-28")} />
        </label>
        <Button type="submit" variant="outline" className="h-11 px-4" disabled={pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Artikel mit Bestand erscheinen im Webshop nur, solange mehr als diese Menge im Laden ist. 1 heisst: das letzte Stück wird online nicht
        verkauft. Artikel ohne Bestand folgen weiter dem Häkchen «Verfügbar».
      </p>
      {message && <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>{message.text}</p>}
    </form>
  );
}
