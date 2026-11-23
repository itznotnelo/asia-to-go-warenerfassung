"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import { createReceiptAction } from "@/app/stock/actions";

export function NewReceiptForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createReceiptAction({ supplierId: supplierId || null, deliveryNote });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/stock/receipts/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Lieferant
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={inputClass()}>
            <option value="">Ohne Lieferant</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lieferschein-Nr. (freiwillig)
          <input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} className={inputClass()} maxLength={120} />
        </label>
      </div>
      {suppliers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Noch keine Lieferanten erfasst.{" "}
          <Link href="/stock/suppliers" className="underline underline-offset-2">
            Lieferant anlegen
          </Link>
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" className="h-11 px-4" disabled={pending}>
          {pending ? "Wird angelegt …" : "Lieferung starten"}
        </Button>
      </div>
    </form>
  );
}
