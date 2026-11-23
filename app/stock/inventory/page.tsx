import { formatChf } from "@/lib/pricing";
import { getInventoryList } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly, shopToday } from "@/lib/stock/dates";
import { inputClass } from "@/lib/input-class";
import { PrintButton } from "@/components/stock/print-button";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventarliste per {dayLabel}</h1>
          <p className="text-sm text-muted-foreground">
            Warenlager zu Einkaufspreisen (ohne MwSt) für den Jahresabschluss. {cutoff ? "Bestand am Ende dieses Tages." : "Bestand jetzt."} Bewertet
            mit dem aktuellen EK pro Artikel.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a href={csvHref} className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-muted">
            Excel (CSV)
          </a>
          <PrintButton />
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-sm">
          Stichtag
          <input type="date" name="date" defaultValue={cutoff ?? ""} className={inputClass()} />
        </label>
        <button type="submit" className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-muted">
          Anzeigen
        </button>
        <a href={`?date=${lastYearEnd}`} className="inline-flex h-11 items-center px-2 text-sm underline underline-offset-2">
          31.12.{lastYearEnd.slice(0, 4)}
        </a>
        <a href="?" className="inline-flex h-11 items-center px-2 text-sm underline underline-offset-2">
          Heute
        </a>
      </form>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Total: <span className="font-numeric text-lg font-semibold">{formatChf(list.totalRappen)}</span>
        </span>
        <span className="text-muted-foreground">{list.lines.length} Positionen</span>
        {list.withoutCost > 0 && <span className="text-primary">{list.withoutCost} Artikel ohne EK (nicht im Total)</span>}
        {list.negative > 0 && <span className="text-destructive">{list.negative} Artikel mit Bestand unter null (zählen als 0)</span>}
      </div>

      {list.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Bestand erfasst.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-normal">Artikel</th>
                <th className="px-3 py-2 font-normal">Kategorie</th>
                <th className="px-3 py-2 text-right font-normal">Menge</th>
                <th className="px-3 py-2 text-right font-normal">EK</th>
                <th className="px-3 py-2 text-right font-normal">Wert</th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr key={line.sku} className="border-b border-border last:border-b-0 break-inside-avoid">
                  <td className="px-3 py-1.5">
                    {line.nameDe}
                    <span className="font-numeric text-xs text-muted-foreground"> · {line.sku}</span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{line.category}</td>
                  <td className={`font-numeric px-3 py-1.5 text-right ${line.qty < 0 ? "text-destructive" : ""}`}>{formatStockQty(line.qty, line.unitType)}</td>
                  <td className="font-numeric px-3 py-1.5 text-right">{line.purchasePriceRappen === null ? "fehlt" : formatChf(line.purchasePriceRappen)}</td>
                  <td className="font-numeric px-3 py-1.5 text-right">{line.valueRappen === null ? "" : formatChf(line.valueRappen)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2" colSpan={4}>
                  Total Warenlager zu EK per {dayLabel}
                </td>
                <td className="font-numeric px-3 py-2 text-right">{formatChf(list.totalRappen)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
