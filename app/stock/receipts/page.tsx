import Link from "next/link";
import { listReceipts } from "@/lib/stock/queries";
import { supplierOptions } from "@/lib/stock/suppliers";
import { NewReceiptForm } from "./new-receipt-form";

import { EmptyState, PageHeader, SectionTitle, listCardClass, pageClass } from "@/components/page";

export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
}

export default async function ReceiptsPage() {
  const [receipts, suppliers] = await Promise.all([listReceipts(), supplierOptions()]);
  const open = receipts.filter((receipt) => receipt.status === "open");
  const booked = receipts.filter((receipt) => receipt.status === "booked");

  return (
    <main className={pageClass()}>
      <PageHeader title="Wareneingang" description="Lieferant wählen, dann alle Artikel der Lieferung scannen und am Schluss einbuchen." />

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <SectionTitle title="Neue Lieferung" />
        <NewReceiptForm suppliers={suppliers} />
      </section>

      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Noch nicht gebucht" tone="warn" />
          <ReceiptList receipts={open} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Gebuchte Lieferungen" />
        {booked.length === 0 ? (
          <EmptyState title="Noch keine Lieferung gebucht.">Die erste Lieferung oben starten.</EmptyState>
        ) : (
          <ReceiptList receipts={booked} />
        )}
      </section>
    </main>
  );
}

function ReceiptList({ receipts }: { receipts: Awaited<ReturnType<typeof listReceipts>> }) {
  return (
    <ul className={listCardClass}>
      {receipts.map((receipt) => (
        <li key={receipt.id} className="border-b border-border last:border-b-0">
          <Link href={`/stock/receipts/${receipt.id}`} className="-mx-4 flex min-h-12 items-center justify-between gap-4 px-4 py-2 transition-colors hover:bg-muted/40">
            <span>
              {receipt.supplierName ?? "Ohne Lieferant"}
              {receipt.deliveryNote && <span className="text-muted-foreground"> · Lieferschein {receipt.deliveryNote}</span>}
            </span>
            <span className="font-numeric text-sm whitespace-nowrap text-muted-foreground">
              {receipt.lineCount} {receipt.lineCount === 1 ? "Position" : "Positionen"} · {formatDay(receipt.bookedAt ?? receipt.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
