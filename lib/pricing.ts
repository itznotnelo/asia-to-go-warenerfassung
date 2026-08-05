export type ContentUnit = "g" | "kg" | "ml" | "l" | "stk";

export interface UnitPrice {
  valueRappen: number;
  unit: "kg" | "l";
}

/**
 * Grundpreis nach Preisbekanntgabeverordnung. Gibt `null` zurück, wenn keine
 * Vergleichseinheit ermittelbar ist (Stückware, fehlende Angaben) — die UI
 * zeigt dann nichts an, statt etwas zu erfinden.
 */
export function calcUnitPrice(
  priceRappen: number,
  contentAmount: number | null | undefined,
  contentUnit: ContentUnit | null | undefined,
): UnitPrice | null {
  if (!contentAmount || contentAmount <= 0 || !contentUnit) return null;

  switch (contentUnit) {
    case "g":
      return { valueRappen: Math.round(priceRappen / (contentAmount / 1000)), unit: "kg" };
    case "kg":
      return { valueRappen: Math.round(priceRappen / contentAmount), unit: "kg" };
    case "ml":
      return { valueRappen: Math.round(priceRappen / (contentAmount / 1000)), unit: "l" };
    case "l":
      return { valueRappen: Math.round(priceRappen / contentAmount), unit: "l" };
    case "stk":
      return null;
  }
}

/** Steueranteil, aus einem MwSt-inklusive Bruttopreis herausgerechnet. */
export function vatRappen(grossRappen: number, rate: number): number {
  return Math.round(grossRappen - grossRappen / (1 + rate / 100));
}

/** Rundung der Endsumme auf 5 Rappen (Barzahlung kennt keine 1-/2-Rappen-Stücke). */
export function roundTo5(rappen: number): number {
  return Math.round(rappen / 5) * 5;
}

/** Einzige Stelle, an der Rappen-Beträge als CHF-String formatiert werden. */
export function formatChf(rappen: number): string {
  const negative = rappen < 0;
  const francs = Math.abs(rappen) / 100;
  const [wholePart, decimalPart] = francs.toFixed(2).split(".");
  const withThousands = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${negative ? "-" : ""}CHF ${withThousands}.${decimalPart}`;
}
