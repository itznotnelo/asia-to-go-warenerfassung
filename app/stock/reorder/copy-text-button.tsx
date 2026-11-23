"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Shows the order text and copies it; sending it is the shop owner's job, never the app's. */
export function CopyTextButton({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the text is shown, select it by hand.
      setShown(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void copy()}>
          {copied ? "Kopiert" : "Bestelltext kopieren"}
        </Button>
        <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setShown((value) => !value)}>
          {shown ? "Text ausblenden" : "Text ansehen"}
        </Button>
      </div>
      {shown && (
        <textarea readOnly value={text} rows={Math.min(20, text.split("\n").length + 1)} className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-sm" />
      )}
    </div>
  );
}
