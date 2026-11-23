import Link from "next/link";
import { formatChf } from "@/lib/pricing";
import { getStockOverview, type StockListItem } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { expiryText } from "@/lib/stock/lots";
import { DEAD_STOCK_DAYS } from "@/lib/stock/overview-math";
import { MovementTable } from "@/components/stock/movement-table";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-xl font-semibold">Lager</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card p-4 hover:border-primary/60 hover:bg-muted/40"
          >
            <span className="font-medium">{action.title}</span>
            <span className="text-sm text-muted-foreground">{action.text}</span>
          </Link>
        ))}
      </div>

      {(overview.openReceipts > 0 || overview.openStocktakes > 0) && (
        <p className="text-sm text-primary">
          {overview.openReceipts > 0 && (
            <Link href="/stock/receipts" className="underline underline-offset-2">
              {overview.openReceipts === 1 ? "1 Lieferung" : `${overview.openReceipts} Lieferungen`} noch nicht gebucht
            </Link>
          )}
          {overview.openReceipts > 0 && overview.openStocktakes > 0 && " · "}
          {overview.openStocktakes > 0 && (
            <Link href="/stock/counts" className="underline underline-offset-2">
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
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-medium">So fängt die Bestandsführung an</p>
          <p className="mt-1 text-muted-foreground">
            Ein Artikel bekommt einen Bestand, sobald er gezählt (Inventur) oder eine Lieferung von ihm eingebucht wird. Am einfachsten: eine
            Inventur pro Regal starten und alles einmal scannen.
          </p>
        </section>
      )}

      {overview.negative.length > 0 && (
        <ListSection title="Bestand unter null, bitte nachzählen" tone="error" items={overview.negative} />
      )}

      {urgent.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Läuft in 7 Tagen ab oder ist abgelaufen" href="/stock/expiry" />
          <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
            {urgent.slice(0, 8).map((row) => (
              <li key={row.lotId} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 border-b border-border py-2 last:border-b-0">
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
        <div className="rounded-lg border border-border bg-card px-4">
          <MovementTable movements={overview.recent} />
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Im Webshop erscheint ein Artikel mit Bestand nur, solange mehr als {overview.safetyBuffer} Stück da{" "}
        {overview.safetyBuffer === 1 ? "ist" : "sind"} (Sicherheitsbestand, änderbar unter{" "}
        <Link href="/settings" className="underline underline-offset-2">
          Einstellungen
        </Link>
        ).
      </p>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline">
          Alle ansehen
        </Link>
      )}
    </div>
  );
}

function ListSection({ title, items, href, tone }: { title: string; items: StockListItem[]; href?: string; tone?: "error" }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} href={href} />
      <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
        {items.slice(0, 10).map((item) => (
          <li key={item.id} className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
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

function StatCard({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-numeric text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg border border-border bg-card p-4 hover:border-primary/60">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-border bg-card p-4">{body}</div>
  );
}
