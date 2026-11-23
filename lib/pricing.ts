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

/** Die einzigen zulässigen MwSt-Sätze (reduziert / Normalsatz), siehe swiss-food-compliance. */
export const VAT_RATES: readonly number[] = [2.6, 8.1];

/** Steueranteil, aus einem MwSt-inklusive Bruttopreis herausgerechnet. */
export function vatRappen(grossRappen: number, rate: number): number {
  return Math.round(grossRappen - grossRappen / (1 + rate / 100));
}

export interface VatBreakdownLine {
  grossRappen: number;
  vatRate: number;
}

export interface VatBreakdownRow {
  vatRate: number;
  grossRappen: number;
  netRappen: number;
  vatRappen: number;
}

/**
 * MwSt-Ausweis pro Satz für Belege: summiert zuerst die Bruttobeträge je Satz
 * und rundet dann einmal pro Satz, wie die MWST-Abrechnung. Pro Zeile runden
 * und summieren driftet ab (10 × 99 Rp. zu 2.6 %: 10 × 3 = 30 statt 25).
 * Rechnet in Basispunkten (260/810), damit kein Float-Satz in die Rundung kommt.
 * Wirft bei einem Satz ausser 2.6/8.1 statt einen falschen Beleg zu drucken.
 */
export function vatBreakdown(lines: readonly VatBreakdownLine[]): VatBreakdownRow[] {
  const grossByBasisPoints = new Map<number, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.grossRappen)) {
      throw new RangeError(`grossRappen muss ganzzahlig sein: ${line.grossRappen}`);
    }
    if (!VAT_RATES.includes(line.vatRate)) {
      throw new RangeError(`Unbekannter MwSt-Satz: ${line.vatRate}`);
    }
    const basisPoints = Math.round(line.vatRate * 100);
    grossByBasisPoints.set(basisPoints, (grossByBasisPoints.get(basisPoints) ?? 0) + line.grossRappen);
  }
  return [...grossByBasisPoints.entries()]
    .sort(([a], [b]) => a - b)
    .map(([basisPoints, grossRappen]) => {
      const vat = Math.round((grossRappen * basisPoints) / (10_000 + basisPoints));
      return { vatRate: basisPoints / 100, grossRappen, netRappen: grossRappen - vat, vatRappen: vat };
    });
}

/** Rundung der Endsumme auf 5 Rappen (Barzahlung kennt keine 1-/2-Rappen-Stücke). */
export function roundTo5(rappen: number): number {
  return Math.round(rappen / 5) * 5;
}

// Strip what people type around a Swiss price: spaces, thousands apostrophes
// (' and ’) and a trailing ".-" / ".–" ("4.-"). Everything else must match exactly.
function normalizeNumberInput(input: string): string {
  return input
    .trim()
    .replace(/[\s'’]/g, "")
    .replace(/\.[-–]$/, "");
}

/**
 * Strenger CHF-Parser für alle Preisfelder. Gibt `null` zurück statt zu raten:
 * "1'250.00" → 125000, "4,5" → 450, aber "3 50" (Leerzeichen als Komma
 * gemeint?), "4.20." oder "12.999" → null. parseFloat hätte "1'250" als 1 gelesen.
 */
export function parseChfToRappen(input: string): number | null {
  const raw = input.trim();
  // "3 50" is ambiguous (3.50 or 350?), refuse instead of guessing.
  if (/\d\s+\d{1,2}$/.test(raw) && !/[.,]/.test(raw)) return null;
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(normalizeNumberInput(raw));
  if (!match) return null;
  const francs = Number(match[1]);
  const rappen = Number((match[2] ?? "").padEnd(2, "0"));
  const total = francs * 100 + rappen;
  return Number.isSafeInteger(total) ? total : null;
}

export const PRICE_ERROR = "Preis nicht erkannt. Beispiel: 4.50 oder 1'250.00";

export const CONTENT_AMOUNT_ERROR = "Inhaltsmenge nicht erkannt. Beispiel: 500 oder 1.5";

/** Strenger Parser für Inhaltsmengen (max. 3 Nachkommastellen): "1'000" → 1000, nicht 1. */
export function parseContentAmount(input: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(normalizeNumberInput(input));
  if (!match) return null;
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  return Number.isFinite(value) ? value : null;
}

/** Einzige Stelle, an der Rappen-Beträge als CHF-String formatiert werden. */
export function formatChf(rappen: number): string {
  const negative = rappen < 0;
  const francs = Math.abs(rappen) / 100;
  const [wholePart, decimalPart] = francs.toFixed(2).split(".");
  const withThousands = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${negative ? "-" : ""}CHF ${withThousands}.${decimalPart}`;
}
