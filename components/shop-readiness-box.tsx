import Link from "next/link";
import { cn } from "@/lib/utils";
import { missingLabels, SHOP_STATE_LABELS, shopState, type MissingKey } from "@/lib/shop-readiness";

interface ShopReadinessBoxProps {
  missing: MissingKey[];
  isAvailable: boolean;
  archived: boolean;
  /** Next article that still needs data, so finishing one leads straight to the next. */
  nextIncomplete?: { id: string; nameDe: string } | null;
  /** Stock is tracked: availability follows the stock, there is no checkbox to tick. */
  stockTracked?: boolean;
}

/** Says in plain words whether the webshop shows this article, and what is still to do. */
export function ShopReadinessBox({ missing, isAvailable, archived, nextIncomplete, stockTracked = false }: ShopReadinessBoxProps) {
  const state = shopState({ missingCount: missing.length, isAvailable, archived });
  if (state === "archived") return null;

  return (
    <section
      aria-label="Stand im Webshop"
      className={cn(
        "flex flex-col gap-2 rounded-md border px-4 py-3",
        state === "visible" ? "border-success/50 bg-success/15" : "border-border bg-secondary",
      )}
    >
      <p className="text-base font-semibold">{SHOP_STATE_LABELS[state]}</p>

      {state === "incomplete" && (
        <>
          <p className="text-sm">Es fehlt noch:</p>
          <ul className="list-disc pl-5 text-sm">
            {missingLabels(missing).map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      )}

      {state === "hidden-unavailable" &&
        (stockTracked ? (
          <p className="text-sm">Zu wenig Bestand. Der Artikel erscheint wieder, sobald genug da ist (Lieferung einbuchen oder Bestand korrigieren).</p>
        ) : (
          <p className="text-sm">Unten «Verfügbar» ankreuzen und speichern, dann erscheint der Artikel im Webshop.</p>
        ))}

      {state !== "incomplete" && nextIncomplete && (
        <Link
          href={`/products/${nextIncomplete.id}`}
          className="inline-flex min-h-11 items-center self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Weiter mit: {nextIncomplete.nameDe}
        </Link>
      )}
    </section>
  );
}
