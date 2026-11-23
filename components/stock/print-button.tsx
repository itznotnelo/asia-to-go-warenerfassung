"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Drucken" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" className="h-11 px-4 print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
