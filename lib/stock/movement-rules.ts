// Pure rules for stock movements: which sign a type may have, and the German
// labels. Shared by the ledger (server) and the UI (client).

export type StockMovementType =
  | "receipt"
  | "sale_shop"
  | "sale_web"
  | "count_correction"
  | "waste"
  | "return_to_supplier"
  | "manual";

export type WasteReason = "expired" | "damaged" | "spoiled" | "other";

export const MOVEMENT_TYPES = [
  "receipt",
  "sale_shop",
  "sale_web",
  "count_correction",
  "waste",
  "return_to_supplier",
  "manual",
] as const satisfies readonly StockMovementType[];

export const WASTE_REASONS = ["expired", "damaged", "spoiled", "other"] as const satisfies readonly WasteReason[];

const DIRECTION: Record<StockMovementType, "in" | "out" | "any"> = {
  receipt: "in",
  sale_shop: "out",
  sale_web: "out",
  count_correction: "any",
  waste: "out",
  return_to_supplier: "out",
  manual: "any",
};

const LABEL: Record<StockMovementType, string> = {
  receipt: "Wareneingang",
  sale_shop: "Verkauf Laden",
  sale_web: "Verkauf Webshop",
  count_correction: "Inventur-Korrektur",
  waste: "Abschreibung",
  return_to_supplier: "Retour an Lieferant",
  manual: "Manuelle Buchung",
};

const WASTE_LABEL: Record<WasteReason, string> = {
  expired: "abgelaufen",
  damaged: "beschädigt",
  spoiled: "verdorben",
  other: "anderer Grund",
};

export function movementTypeLabel(type: StockMovementType): string {
  return LABEL[type];
}

export function wasteReasonLabel(reason: WasteReason): string {
  return WASTE_LABEL[reason];
}

/**
 * Null when the quantity fits the type, otherwise a German message. Receipts
 * only add, sales/waste/returns only remove, corrections and manual bookings
 * go either way. A reversal (undo) flips the sign, so it is exempt.
 */
export function checkMovementQuantity(type: StockMovementType, quantity: number, isReversal = false): string | null {
  if (!Number.isSafeInteger(quantity)) return "Menge muss eine ganze Zahl sein.";
  if (quantity === 0) return "Menge darf nicht 0 sein.";
  if (isReversal) return null;
  const direction = DIRECTION[type];
  if (direction === "in" && quantity < 0) return `${LABEL[type]}: Menge muss positiv sein.`;
  if (direction === "out" && quantity > 0) return `${LABEL[type]}: Menge muss negativ sein.`;
  return null;
}

/** Undo is refused for web sales: those are reversed by cancelling the order. */
export function canUndoType(type: StockMovementType): boolean {
  return type !== "sale_web";
}
