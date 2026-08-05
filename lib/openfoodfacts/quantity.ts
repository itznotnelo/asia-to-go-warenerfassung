import type { ContentUnit } from "@/lib/pricing";

export interface ParsedQuantity {
  contentAmount: number;
  contentUnit: ContentUnit;
}

/**
 * OFF liefert `quantity` als Freitext ("500 g", "1L", "33 cl", "2 x 100g",
 * manchmal leer oder unbrauchbar). Nur eindeutige `<Zahl><Einheit>`-Muster
 * übernehmen — bei Mehrfachpackungen ("2x100g") ist unklar, ob Gesamt- oder
 * Stückmenge gemeint ist, deshalb bewusst `null` statt zu raten.
 */
export function parseQuantity(quantity: string | undefined): ParsedQuantity | null {
  if (!quantity) return null;
  const trimmed = quantity.trim();
  if (!trimmed || /[x×]/i.test(trimmed)) return null;

  const match = /^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)$/i.exec(trimmed);
  if (!match) return null;

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  switch (unit) {
    case "kg":
      return { contentAmount: amount, contentUnit: "kg" };
    case "g":
      return { contentAmount: amount, contentUnit: "g" };
    case "l":
      return { contentAmount: amount, contentUnit: "l" };
    case "ml":
      return { contentAmount: amount, contentUnit: "ml" };
    case "cl":
      // ContentUnit kennt kein "cl" — auf ml umrechnen, damit calcUnitPrice greift.
      return { contentAmount: amount * 10, contentUnit: "ml" };
    default:
      return null;
  }
}
