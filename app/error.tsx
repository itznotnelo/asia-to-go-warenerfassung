"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// German fallback instead of Next's English default screen (review must 3).
export default function ErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Diese Seite konnte nicht geladen werden</h1>
      <p className="text-muted-foreground">Bereits gespeicherte Artikel sind nicht betroffen. Bitte die Seite neu laden.</p>
      <Button type="button" size="lg" className="h-14 self-start px-6 text-base" onClick={() => window.location.reload()}>
        Neu laden
      </Button>
    </div>
  );
}
