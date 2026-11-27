import { formatChf } from "@/lib/pricing";
import { getInventoryList } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly, shopToday } from "@/lib/stock/dates";
import { inputClass } from "@/lib/input-class";
import { PrintButton } from "@/components/stock/print-button";

import { EmptyState, PageHeader, pageClass } from "@/components/page";
import { buttonVariants } from "@/components/ui/button-variants";

export const dynamic = "force-dynamic";

export default async function InventoryListPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const cutoff = typeof date === "string" && parseDateOnly(date) ? date : null;
  const list = await getInventoryList(cutoff);
  const today = shopToday();
  const dayLabel = formatDateOnly(parseDateOnly(cutoff ?? today) as Date);
  const lastYearEnd = `${Number(today.slice(0, 4)) - 1}-12-31`;
  const csvHref = `/api/export/inventory${cutoff ? `?date=${cutoff}` : ""}`;

  return (
    <main className={pageClass() + " gap-6"}>
      <PageHeader
        title={`Inventarliste per ${dayLabel}`}
        description={`Warenlager zu Einkaufspreisen (ohne MwSt) für den Jahresabschluss. ${cutoff ? "Bestand am Ende dieses Tages." : "Bestand jetzt."} Bewertet mit dem aktuellen EK pro Artikel.`}
        actions={
          <div className="flex gap-2 print:hidden">
            <a href={csvHref} className={buttonVariants({ variant: "outline" })}>
              Excel (CSV)
            </a>
            <PrintButton />
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          Stichtag
          <input type="date" name="date" defaultValue={cutoff ?? ""} className={inputClass()} />
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Anzeigen
        </button>
        <span className="ml-2 flex items-center gap-1 text-sm text-muted-foreground">
          Schnellwahl:
          <a href={`?date=${lastYearEnd}`} className={buttonVariants({ variant: "ghost" })}>
            31.12.{lastYearEnd.slice(0, 4)}
          </a>
          <a href="?" className={buttonVariants({ variant: "ghost" })}>
            Heute
          </a>
        </span>
      </form>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span className="flex items-baseline gap-2 text-muted-foreground">
          Total <span className="font-numeric text-2xl font-semibold text-foreground">{formatChf(list.totalRappen)}</span>
        </span>
        <span className="font-numeric text-muted-foreground">{list.lines.length} Positionen</span>
        {list.withoutCost > 0 && <span className="text-primary">{list.withoutCost} Artikel ohne EK (nicht im Total)</span>}
        {list.negative > 0 && <span className="text-destructive">{list.negative} Artikel mit Bestand unter null (zählen als 0)</span>}
      </div>

      {list.lines.length === 0 ? (
        <EmptyState title="Noch kein Bestand erfasst.">Bestand entsteht mit der ersten Inventur oder Lieferung.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Artikel</th>
                <th className="px-3 py-3 font-medium">Kategorie</th>
                <th className="px-3 py-3 text-right font-medium">Menge</th>
                <th className="px-3 py-3 text-right font-medium">EK</th>
                <th className="px-4 py-3 text-right font-medium">Wert</th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr key={line.sku} className="border-b border-border last:border-b-0 break-inside-avoid">
                  <td className="px-4 py-2">
                    {line.nameDe}
                    <span className="font-numeric text-xs text-muted-foreground"> · {line.sku}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{line.category}</td>
                  <td className={`font-numeric px-3 py-2 text-right whitespace-nowrap ${line.qty < 0 ? "text-destructive" : ""}`}>{formatStockQty(line.qty, line.unitType)}</td>
                  <td className="font-numeric px-3 py-2 text-right whitespace-nowrap">{line.purchasePriceRappen === null ? "fehlt" : formatChf(line.purchasePriceRappen)}</td>
                  <td className="font-numeric px-4 py-2 text-right whitespace-nowrap">{line.valueRappen === null ? "" : formatChf(line.valueRappen)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-4 py-3" colSpan={4}>
                  Total Warenlager zu EK per {dayLabel}
                </td>
                <td className="font-numeric px-4 py-3 text-right whitespace-nowrap">{formatChf(list.totalRappen)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  );
}
