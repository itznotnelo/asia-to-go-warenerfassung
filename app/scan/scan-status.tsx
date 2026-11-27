import { cn } from "@/lib/utils";
import type { ScanState } from "./scan-reducer";

interface StatusPresentation {
  label: string;
  detail?: string;
  className: string;
  animate?: "pulse" | "flash";
}

export function presentStatus(state: ScanState): StatusPresentation {
  switch (state.status) {
    case "idle":
      return {
        label: "Bereit zum Scannen",
        detail: "Barcode scannen oder unten eintippen",
        // Calm, static ready state (no glow loop): amber hairline says "armed".
        className: "border border-primary/45 bg-card text-foreground",
      };
    case "looking-up":
      return {
        label: "Suche läuft …",
        detail: state.ean,
        className: "bg-primary/20 text-primary",
        animate: "pulse",
      };
    case "existing":
      return {
        label: "Artikel bereits erfasst",
        detail: `${state.product.nameDe} · ${state.product.sku}`,
        className: "bg-primary text-primary-foreground",
        animate: "flash",
      };
    case "archived":
      return {
        label: "Artikel ist gelöscht",
        detail: `${state.product.nameDe} · ${state.product.sku}`,
        className: "bg-destructive text-destructive-foreground",
        animate: "flash",
      };
    case "new-hit":
      return {
        label: "Neuer Artikel: online gefunden",
        detail: state.ean,
        className: "bg-primary text-primary-foreground",
        animate: "flash",
      };
    case "new-miss":
      return {
        label: "Neuer Artikel: nicht online gefunden",
        detail: state.ean,
        className: "bg-secondary text-foreground",
      };
    case "off-error":
      return {
        label: "Online-Suche geht gerade nicht",
        detail: `${state.ean}: bitte von Hand erfassen`,
        className: "bg-destructive text-destructive-foreground",
        animate: "flash",
      };
    case "invalid":
      return {
        label: "Ungültiger Barcode",
        detail: state.barcode,
        className: "bg-destructive text-destructive-foreground",
        animate: "flash",
      };
    case "no-barcode":
      return {
        label: "Neuer Artikel ohne Barcode",
        detail: "Bekommt beim Speichern eine eigene Artikelnummer",
        className: "bg-secondary text-foreground",
      };
    case "saved":
      return {
        label: state.message,
        className: "bg-success text-success-foreground",
        animate: "flash",
      };
  }
}

function statusKey(state: ScanState): string {
  if ("ean" in state) return `${state.status}-${state.ean}`;
  if ("barcode" in state) return `${state.status}-${state.barcode}`;
  if ("product" in state) return `${state.status}-${state.product.id}`;
  if ("message" in state) return `${state.status}-${state.message}`;
  return state.status;
}

export function ScanStatus({ state }: { state: ScanState }) {
  const presentation = presentStatus(state);

  return (
    <div
      key={statusKey(state)}
      className={cn(
        "flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-lg px-6 py-5 text-center transition-colors",
        presentation.className,
        presentation.animate === "pulse" && "animate-scan-ready",
        presentation.animate === "flash" && "animate-scan-flash",
      )}
    >
      <span className="text-2xl font-semibold text-balance">{presentation.label}</span>
      {presentation.detail && <span className={cn("text-sm opacity-80", state.status !== "idle" && state.status !== "no-barcode" && "font-numeric")}>{presentation.detail}</span>}
    </div>
  );
}
