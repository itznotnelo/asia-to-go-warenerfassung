"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateOrderStatus } from "./actions";
import { cancelWebOrderAction } from "@/app/stock/actions";
import { NEXT_STATUS, nextActionLabel, statusLabel, type OrderStatus } from "./order-labels";

interface OrderRow {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string | null;
  fulfilmentType: string;
  totalChf: string;
  notes: string | null;
  createdAt: string;
  items: Array<{ id: string; nameDe: string; qty: number }>;
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cancel(order: OrderRow) {
    setError(null);
    startTransition(async () => {
      const result = await cancelWebOrderAction({ orderId: order.id });
      setConfirmCancel(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function advance(order: OrderRow) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    startTransition(async () => {
      await updateOrderStatus({ id: order.id, status: next });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {orders.map((order) => (
        <div key={order.id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{order.customerName}</p>
              <p className="text-sm text-muted-foreground">
                {order.customerPhone ?? "ohne Telefon"} · {order.fulfilmentType === "delivery" ? "Lieferung" : "Abholung"} · bestellt{" "}
                {new Date(order.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right">
              <p className="font-numeric text-lg font-semibold">{order.totalChf}</p>
              <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {statusLabel(order.status, order.fulfilmentType)}
              </span>
            </div>
          </div>

          <ul className="flex flex-col border-y border-border text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex min-h-10 items-center gap-3 border-b border-border py-1.5 last:border-b-0">
                <span className="font-numeric w-12 shrink-0 text-right text-muted-foreground">{item.qty} ×</span>
                <span>{item.nameDe}</span>
              </li>
            ))}
          </ul>

          {order.notes && <p className="text-sm text-muted-foreground">Notiz: {order.notes}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {NEXT_STATUS[order.status] && (
              <Button type="button" className="h-11 px-5" disabled={pending} onClick={() => advance(order)}>
                {nextActionLabel(order.status, order.fulfilmentType)}
              </Button>
            )}
            {confirmCancel === order.id ? (
              <>
                <span className="text-sm">Bestellung stornieren? Der Bestand wird zurückgebucht. Rückzahlung läuft nicht über diese App.</span>
                <Button type="button" variant="destructive" className="h-11 px-4" disabled={pending} onClick={() => cancel(order)}>
                  Ja, stornieren
                </Button>
                <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setConfirmCancel(null)}>
                  Nein
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" className="ml-auto h-11 px-4 text-muted-foreground" disabled={pending} onClick={() => setConfirmCancel(order.id)}>
                Stornieren
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
