import Link from "next/link";
import { formatChf } from "@/lib/pricing";
import { movementTypeLabel, wasteReasonLabel } from "@/lib/stock/movement-rules";
import { formatStockQty } from "@/lib/stock/units";
import type { MovementView } from "@/lib/stock/queries";
import { cn } from "@/lib/utils";
import { UndoButton } from "./undo-button";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });
}

/** Ledger rows, newest first. `showProduct` = false on the article page itself. */
export function MovementTable({ movements, showProduct = true }: { movements: MovementView[]; showProduct?: boolean }) {
  if (movements.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p>;
  return (
    <ul className="flex flex-col">
      {movements.map((movement) => {
        const details = [
          movement.wasteReason ? wasteReasonLabel(movement.wasteReason) : null,
          movement.supplierName,
          movement.unitCostRappen !== null ? `EK ${formatChf(movement.unitCostRappen)}` : null,
          movement.note,
        ].filter(Boolean);
        return (
          <li
            key={movement.id}
            className={cn(
              "flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0",
              movement.reversed && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            <div className="flex flex-col">
              <span>
                {movementTypeLabel(movement.type)}
                {movement.isReversal && <span className="text-muted-foreground"> (rückgängig)</span>}
                {showProduct && (
                  <>
                    {" · "}
                    <Link href={`/products/${movement.productId}`} className="underline-offset-2 hover:underline">
                      {movement.productName}
                    </Link>
                  </>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(movement.createdAt)}
                {details.length > 0 && ` · ${details.join(" · ")}`}
              </span>
            </div>
            {/* Fixed columns so quantities line up whether or not a row has the undo button. */}
            <div className="grid grid-cols-[5.5rem_6.5rem_8.5rem] items-center gap-2 text-right">
              <span className={cn("font-numeric", movement.quantity > 0 ? "text-success" : "text-foreground")}>
                {movement.quantity > 0 ? "+" : ""}
                {formatStockQty(movement.quantity, movement.unitType)}
              </span>
              <span className={cn("font-numeric text-sm", movement.stockAfter < 0 ? "text-destructive" : "text-muted-foreground")}>
                = {formatStockQty(movement.stockAfter, movement.unitType)}
              </span>
              <span>{movement.canUndo && <UndoButton movementId={movement.id} />}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
