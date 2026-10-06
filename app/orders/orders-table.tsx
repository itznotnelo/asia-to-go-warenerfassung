"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateOrderStatus } from "./actions";

type OrderStatus = "received" | "picked" | "ready";

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = { received: "picked", picked: "ready", ready: null };
const STATUS_LABELS: Record<OrderStatus, string> = { received: "Eingegangen", picked: "Gepickt", ready: "Bereit" };
const NEXT_ACTION_LABELS: Record<OrderStatus, string> = { received: "Als gepickt markieren", picked: "Als bereit markieren", ready: "" };

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
  const [, startTransition] = useTransition();

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
      {orders.map((order) => (
        <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{order.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {order.customerPhone ?? "—"} · {order.fulfilmentType === "delivery" ? "Lieferung" : "Abholung"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-numeric font-medium">{order.totalChf}</p>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {STATUS_LABELS[order.status]}
              </span>
            </div>
          </div>

          <ul className="flex flex-col gap-1 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between text-muted-foreground">
                <span>{item.nameDe}</span>
                <span className="font-numeric">× {item.qty}</span>
              </li>
            ))}
          </ul>

          {order.notes && <p className="text-sm text-muted-foreground">Notiz: {order.notes}</p>}

          {NEXT_STATUS[order.status] && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => advance(order)}>
                {NEXT_ACTION_LABELS[order.status]}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
