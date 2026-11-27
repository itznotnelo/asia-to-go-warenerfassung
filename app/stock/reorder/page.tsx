import Link from "next/link";
import { getReorderGroups } from "@/lib/stock/queries";
import { formatPacks, formatStockQty } from "@/lib/stock/units";
import { orderMessage } from "@/lib/stock/reorder";
import { CopyTextButton } from "./copy-text-button";
import { PrintButton } from "@/components/stock/print-button";

import { EmptyState, PageHeader, listCardClass, listRowClass, pageClass } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  const groups = await getReorderGroups();
  const printedAt = new Date().toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" });

  return (
    <main className={pageClass()}>
      <PageHeader
        title="Nachbestellen"
        description={
          <>
            <span className="print:hidden">
              Artikel am oder unter dem Meldebestand, pro Lieferant. Die App verschickt nichts: Text kopieren und selbst senden.
            </span>
            <span className="hidden print:inline">Stand {printedAt}</span>
          </>
        }
        actions={groups.length > 0 && <PrintButton />}
      />

      {groups.length === 0 && (
        <EmptyState title="Nichts nachzubestellen.">Den Meldebestand stellt man auf der Artikelseite unter «Lager» ein.</EmptyState>
      )}

      {groups.map((group) => (
        <section key={group.supplier?.id ?? "none"} className="flex flex-col gap-3 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {group.supplier?.name ?? "Ohne Lieferant"}
              {group.supplier?.customerNumber && <span className="text-sm font-normal text-muted-foreground"> · Kundennr. {group.supplier.customerNumber}</span>}
            </h2>
            <span className="text-sm text-muted-foreground">
              {[group.supplier?.phone, group.supplier?.email].filter(Boolean).join(" · ")}
            </span>
          </div>
          <ul className={listCardClass}>
            {group.lines.map((line) => (
              <li key={line.id} className={listRowClass + " flex-wrap"}>
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
    </main>
  );
}
