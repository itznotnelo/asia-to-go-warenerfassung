export type OrderStatus = "received" | "picked" | "ready" | "collected" | "cancelled";

// collected/cancelled come from storage #3135; no button leads there yet.
export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  received: "picked",
  picked: "ready",
  ready: null,
  collected: null,
  cancelled: null,
};

/** "Bereit" next to "Bereitgestellt" read too alike, so ready names the way the order leaves. */
export function statusLabel(status: OrderStatus, fulfilmentType: string): string {
  const delivery = fulfilmentType === "delivery";
  switch (status) {
    case "received":
      return "Eingegangen";
    case "picked":
      return "Bereitgestellt";
    case "ready":
      return delivery ? "Lieferbereit" : "Abholbereit";
    case "collected":
      return delivery ? "Geliefert" : "Abgeholt";
    case "cancelled":
      return "Storniert";
  }
}

/** The button names the state it moves to; null when there is no next step. */
export function nextActionLabel(status: OrderStatus, fulfilmentType: string): string | null {
  const next = NEXT_STATUS[status];
  return next ? statusLabel(next, fulfilmentType) : null;
}
