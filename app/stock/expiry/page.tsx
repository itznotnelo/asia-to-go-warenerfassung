import Link from "next/link";
import { getExpiryList, type ExpiryRow } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { expiryText } from "@/lib/stock/lots";
import { WriteOffButton } from "./write-off-button";

export const dynamic = "force-dynamic";

const SECTIONS: { bucket: ExpiryRow["bucket"]; title: string; tone: string }[] = [
  { bucket: "expired", title: "Abgelaufen", tone: "text-destructive" },
  { bucket: "week", title: "Läuft in 7 Tagen ab", tone: "text-primary" },
  { bucket: "month", title: "Läuft in 30 Tagen ab", tone: "text-foreground" },
];

export default async function ExpiryPage() {
  const rows = await getExpiryList(30);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold">Haltbarkeit (MHD)</h1>
        <p className="text-sm text-muted-foreground">
          Aus den Lieferungen mit MHD. «Zuerst verkaufen» zeigt, welche Lieferung eines Artikels vorne ins Regal gehört.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nichts läuft in den nächsten 30 Tagen ab. Ein MHD wird beim Wareneingang erfasst.</p>
      )}

      {SECTIONS.map((section) => {
        const list = rows.filter((row) => row.bucket === section.bucket);
        if (list.length === 0) return null;
        return (
          <section key={section.bucket} className="flex flex-col gap-3">
            <h2 className={`text-sm font-medium ${section.tone}`}>
              {section.title} ({list.length})
            </h2>
            <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
              {list.map((row) => {
                const expiry = parseDateOnly(row.expiryDate) as Date;
                return (
                  <li key={row.lotId} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-2 last:border-b-0">
                    <div className="flex flex-col">
                      <Link href={`/products/${row.productId}`} className="hover:underline">
                        {row.nameDe}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        MHD {formatDateOnly(expiry)}, {expiryText(expiry)}
                        {row.batchCode && ` · Charge ${row.batchCode}`}
                        {row.supplierName && ` · ${row.supplierName}`}
                        {row.sellFirst && section.bucket !== "expired" && <span className="text-primary"> · zuerst verkaufen</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-numeric">{formatStockQty(row.remaining, row.unitType)}</span>
                      <WriteOffButton lotId={row.lotId} label={`${formatStockQty(row.remaining, row.unitType)} ${row.nameDe}`} defaultReason={section.bucket === "expired" ? "expired" : "spoiled"} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
