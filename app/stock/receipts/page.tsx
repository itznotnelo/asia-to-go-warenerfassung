import Link from "next/link";
import { listReceipts } from "@/lib/stock/queries";
import { supplierOptions } from "@/lib/stock/suppliers";
import { NewReceiptForm } from "./new-receipt-form";

export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
}

export default async function ReceiptsPage() {
  const [receipts, suppliers] = await Promise.all([listReceipts(), supplierOptions()]);
  const open = receipts.filter((receipt) => receipt.status === "open");
  const booked = receipts.filter((receipt) => receipt.status === "booked");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="text-xl font-semibold">Wareneingang</h1>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">Neue Lieferung</h2>
        <p className="text-sm text-muted-foreground">Lieferant wählen, dann alle Artikel der Lieferung scannen und am Schluss einbuchen.</p>
        <NewReceiptForm suppliers={suppliers} />
      </section>

      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Noch nicht gebucht</h2>
          <ReceiptList receipts={open} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Gebuchte Lieferungen</h2>
        {booked.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine.</p> : <ReceiptList receipts={booked} />}
      </section>
    </div>
  );
}

function ReceiptList({ receipts }: { receipts: Awaited<ReturnType<typeof listReceipts>> }) {
  return (
    <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
      {receipts.map((receipt) => (
        <li key={receipt.id} className="border-b border-border last:border-b-0">
          <Link href={`/stock/receipts/${receipt.id}`} className="flex min-h-12 items-center justify-between gap-4 py-2 hover:underline">
            <span>
              {receipt.supplierName ?? "Ohne Lieferant"}
              {receipt.deliveryNote && <span className="text-muted-foreground"> · Lieferschein {receipt.deliveryNote}</span>}
            </span>
            <span className="text-sm text-muted-foreground">
              {receipt.lineCount} {receipt.lineCount === 1 ? "Position" : "Positionen"} · {formatDay(receipt.bookedAt ?? receipt.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
