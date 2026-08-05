"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ManualEntryProps {
  onSubmit: (value: string) => void;
}

/** Fallback für unlesbare Barcodes — dieselbe Validierung/Feedback wie ein echter Scan. */
export function ManualEntry({ onSubmit }: ManualEntryProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Barcode manuell eingeben …"
        inputMode="numeric"
        aria-label="Barcode manuell eingeben"
        className="font-numeric h-11 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="submit" variant="outline" className="h-11 px-4">
        Erfassen
      </Button>
    </form>
  );
}
