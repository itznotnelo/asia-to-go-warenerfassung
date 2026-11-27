import Link from "next/link";
import { getExpiryList, type ExpiryRow } from "@/lib/stock/queries";
import { formatStockQty } from "@/lib/stock/units";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { expiryText } from "@/lib/stock/lots";
import { WriteOffButton } from "./write-off-button";

import { EmptyState, PageHeader, SectionTitle, listCardClass, pageClass } from "@/components/page";

export const dynamic = "force-dynamic";

const SECTIONS: { bucket: ExpiryRow["bucket"]; title: string; tone?: "error" | "warn" }[] = [
  { bucket: "expired", title: "Abgelaufen", tone: "error" },
  { bucket: "week", title: "Läuft in 7 Tagen ab", tone: "warn" },
  { bucket: "month", title: "Läuft in 30 Tagen ab" },
];

export default async function ExpiryPage() {
  const rows = await getExpiryList(30);

  return (
    <main className={pageClass()}>
      <PageHeader
        title="Haltbarkeit (MHD)"
        description="Aus den Lieferungen mit MHD. «Zuerst verkaufen» zeigt, welche Lieferung eines Artikels vorne ins Regal gehört."
      />

      {rows.length === 0 && (
        <EmptyState title="Nichts läuft in den nächsten 30 Tagen ab.">Ein MHD wird beim Wareneingang erfasst.</EmptyState>
      )}

      {SECTIONS.map((section) => {
        const list = rows.filter((row) => row.bucket === section.bucket);
        if (list.length === 0) return null;
        return (
          <section key={section.bucket} className="flex flex-col gap-3">
            <SectionTitle title={`${section.title} (${list.length})`} tone={section.tone} />
            <ul className={listCardClass}>
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
                      <span className="font-numeric whitespace-nowrap">{formatStockQty(row.remaining, row.unitType)}</span>
                      <WriteOffButton lotId={row.lotId} label={`${formatStockQty(row.remaining, row.unitType)} ${row.nameDe}`} defaultReason={section.bucket === "expired" ? "expired" : "spoiled"} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
