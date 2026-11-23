import Link from "next/link";
import { getReorderGroups } from "@/lib/stock/queries";
import { formatPacks, formatStockQty } from "@/lib/stock/units";
import { orderMessage } from "@/lib/stock/reorder";
import { CopyTextButton } from "./copy-text-button";
import { PrintButton } from "@/components/stock/print-button";

export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  const groups = await getReorderGroups();
  const printedAt = new Date().toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Nachbestellen</h1>
          <p className="text-sm text-muted-foreground print:hidden">
            Artikel am oder unter dem Meldebestand, pro Lieferant. Die App verschickt nichts: Text kopieren und selbst senden.
          </p>
          <p className="hidden text-sm print:block">Stand {printedAt}</p>
        </div>
        {groups.length > 0 && <PrintButton />}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nichts nachzubestellen. Den Meldebestand stellt man auf der Artikelseite unter «Lager» ein.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.supplier?.id ?? "none"} className="flex flex-col gap-3 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">
              {group.supplier?.name ?? "Ohne Lieferant"}
              {group.supplier?.customerNumber && <span className="text-sm font-normal text-muted-foreground"> · Kundennr. {group.supplier.customerNumber}</span>}
            </h2>
            <span className="text-sm text-muted-foreground">
              {[group.supplier?.phone, group.supplier?.email].filter(Boolean).join(" · ")}
            </span>
          </div>
          <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
            {group.lines.map((line) => (
              <li key={line.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 border-b border-border py-2 last:border-b-0">
                <span>
                  <Link href={`/products/${line.id}`} className="hover:underline">
                    {line.nameDe}
                  </Link>
                  <span className="font-numeric text-xs text-muted-foreground"> · {line.ean ?? line.sku}</span>
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">
                    noch {formatStockQty(line.stockQty ?? 0, line.unitType)} (Meldebestand {formatStockQty(line.minStock ?? 0, line.unitType)}) ·{" "}
                  </span>
                  <span className="font-medium">bestellen: {formatPacks(line.orderQty, line.packSize, line.unitType)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="print:hidden">
            <CopyTextButton text={orderMessage(group)} />
          </div>
        </section>
      ))}
    </div>
  );
}
