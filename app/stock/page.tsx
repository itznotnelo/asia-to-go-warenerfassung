import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatChf } from "@/lib/pricing";
import { getStockOverview, type StockListItem } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { expiryText } from "@/lib/stock/lots";
import { DEAD_STOCK_DAYS } from "@/lib/stock/overview-math";
import { MovementTable } from "@/components/stock/movement-table";
import { EmptyState, PageHeader, SectionTitle, StatCard, listCardClass, listRowClass, pageClass } from "@/components/page";

// Live stock: never frozen at build time.
export const dynamic = "force-dynamic";

const ACTIONS = [
  { href: "/stock/receipts", title: "Wareneingang", text: "Lieferung scannen und einbuchen" },
  { href: "/stock/sale", title: "Verkauf erfassen", text: "Verkaufte Artikel scannen" },
  { href: "/stock/counts", title: "Inventur", text: "Regal zählen und Bestand korrigieren" },
  { href: "/stock/reorder", title: "Nachbestellen", text: "Was fehlt, pro Lieferant" },
];

export default async function StockOverviewPage() {
  const overview = await getStockOverview();
  const urgent = overview.expiring.filter((row) => row.bucket === "expired" || row.bucket === "week");

  return (
    <main className={pageClass()}>
      <PageHeader title="Lager" description="Bestand, Lieferungen und was bald abläuft." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex min-h-24 flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-muted/40"
          >
            <span className="flex items-center justify-between gap-2 font-semibold">
              {action.title}
              <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-foreground" />
            </span>
            <span className="text-sm text-muted-foreground">{action.text}</span>
          </Link>
        ))}
      </div>

      {(overview.openReceipts > 0 || overview.openStocktakes > 0) && (
        <p className="-mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {overview.openReceipts > 0 && (
            <Link href="/stock/receipts" className="underline underline-offset-4">
              {overview.openReceipts === 1 ? "1 Lieferung" : `${overview.openReceipts} Lieferungen`} noch nicht gebucht
            </Link>
          )}
          {overview.openReceipts > 0 && overview.openStocktakes > 0 && " · "}
          {overview.openStocktakes > 0 && (
            <Link href="/stock/counts" className="underline underline-offset-4">
              {overview.openStocktakes === 1 ? "1 Inventur" : `${overview.openStocktakes} Inventuren`} noch nicht gebucht
            </Link>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Lagerwert zu EK" value={formatChf(overview.valueRappen)} hint={overview.withoutCost > 0 ? `${overview.withoutCost} Artikel ohne EK` : undefined} />
        <StatCard label="Artikel mit Bestand" value={String(overview.trackedCount)} />
        <StatCard label="Wenig Bestand" value={String(overview.low.length)} href="/stock/reorder" />
        <StatCard label="MHD in 30 Tagen" value={String(overview.expiring.length)} href="/stock/expiry" />
      </div>

      {overview.trackedCount === 0 && (
        <EmptyState title="So fängt die Bestandsführung an">
          Ein Artikel bekommt einen Bestand, sobald er gezählt (Inventur) oder eine Lieferung von ihm eingebucht wird. Am einfachsten: eine
          Inventur pro Regal starten und alles einmal scannen.
        </EmptyState>
      )}

      {overview.negative.length > 0 && (
        <ListSection title="Bestand unter null, bitte nachzählen" tone="error" items={overview.negative} />
      )}

      {urgent.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Läuft in 7 Tagen ab oder ist abgelaufen" href="/stock/expiry" />
          <ul className={listCardClass}>
            {urgent.slice(0, 8).map((row) => (
              <li key={row.lotId} className={listRowClass + " flex-wrap"}>
                <Link href={`/products/${row.productId}`} className="hover:underline">
                  {row.nameDe}
                </Link>
                <span className={row.bucket === "expired" ? "text-destructive" : "text-primary"}>
                  MHD {formatDateOnly(parseDateOnly(row.expiryDate) as Date)}, {expiryText(parseDateOnly(row.expiryDate) as Date)} ·{" "}
                  <span className="font-numeric">{formatStockQty(row.remaining, row.unitType)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overview.low.length > 0 && <ListSection title="Wenig Bestand" href="/stock/reorder" items={overview.low} />}

      {overview.dead.length > 0 && (
        <ListSection title={`Ladenhüter: seit ${DEAD_STOCK_DAYS} Tagen keine Bewegung`} items={overview.dead} />
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Letzte Buchungen" href="/stock/movements" />
        <div className={listCardClass}>
          <MovementTable movements={overview.recent} />
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Im Webshop erscheint ein Artikel mit Bestand nur, solange mehr als {overview.safetyBuffer} Stück da{" "}
        {overview.safetyBuffer === 1 ? "ist" : "sind"} (Sicherheitsbestand, änderbar unter{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Einstellungen
        </Link>
        ).
      </p>
    </main>
  );
}

function ListSection({ title, items, href, tone }: { title: string; items: StockListItem[]; href?: string; tone?: "error" }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} href={href} tone={tone} />
      <ul className={listCardClass}>
        {items.slice(0, 10).map((item) => (
          <li key={item.id} className={listRowClass}>
            <Link href={`/products/${item.id}`} className="hover:underline">
              {item.nameDe}
              <span className="font-numeric text-xs text-muted-foreground"> · {item.sku}</span>
            </Link>
            <span className={tone === "error" ? "font-numeric text-destructive" : "font-numeric"}>
              {formatStockQty(item.stockQty, item.unitType)}
              {item.minStock !== null && tone !== "error" && (
                <span className="text-muted-foreground"> / Meldebestand {formatStockQty(item.minStock, item.unitType)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {items.length > 10 && <p className="text-sm text-muted-foreground">und {items.length - 10} weitere</p>}
    </section>
  );
}
