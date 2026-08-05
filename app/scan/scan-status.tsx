import { cn } from "@/lib/utils";
import type { ScanState } from "./scan-reducer";

interface StatusPresentation {
  label: string;
  detail?: string;
  className: string;
  animate?: "pulse" | "flash";
}

function presentStatus(state: ScanState): StatusPresentation {
  switch (state.status) {
    case "idle":
      return {
        label: "Bereit zum Scannen",
        className: "bg-secondary text-foreground",
        animate: "pulse",
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
    case "new-hit":
      return {
        label: "Neuer Artikel — Open Food Facts Treffer",
        detail: state.ean,
        className: "bg-primary text-primary-foreground",
        animate: "flash",
      };
    case "new-miss":
      return {
        label: "Neuer Artikel — kein OFF-Treffer",
        detail: state.ean,
        className: "bg-secondary text-foreground",
      };
    case "off-error":
      return {
        label: "Open Food Facts nicht erreichbar",
        detail: `${state.ean} — manuell erfassen`,
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
        "flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl px-6 py-5 text-center transition-colors",
        presentation.className,
        presentation.animate === "pulse" && "animate-scan-ready",
        presentation.animate === "flash" && "animate-scan-flash",
      )}
    >
      <span className="text-xl font-semibold tracking-tight">{presentation.label}</span>
      {presentation.detail && <span className="font-numeric text-sm opacity-80">{presentation.detail}</span>}
    </div>
  );
}
