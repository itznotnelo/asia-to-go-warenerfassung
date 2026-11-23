import { calcUnitPrice, vatRappen, type ContentUnit } from "@/lib/pricing";
import type { StockUnitType } from "./units";

export interface MarginInput {
  priceRappen: number;
  vatRate: number;
  unitType: StockUnitType;
  contentAmount: number | null;
  contentUnit: ContentUnit | null;
  purchasePriceRappen: number | null;
}

export interface Margin {
  /** Selling price excl. MwSt on the EK basis (per piece, kg or l). */
  netSalesRappen: number;
  costRappen: number;
  marginRappen: number;
  /** Margin in basis points of the net selling price (2500 = 25 %). */
  marginBasisPoints: number;
}

/**
 * Margin per article, computed, never stored. EK is excl. MwSt (Vorsteuer is
 * reclaimed), so it is compared with the VK minus its MwSt. Loose goods
 * compare per kg / l via the Grundpreis from calcUnitPrice (hard rule 3).
 * Null without EK or when the VK basis can't be determined.
 */
export function computeMargin(input: MarginInput): Margin | null {
  if (input.purchasePriceRappen === null) return null;
  let grossRappen: number;
  if (input.unitType === "piece") {
    grossRappen = input.priceRappen;
  } else {
    const unitPrice = calcUnitPrice(input.priceRappen, input.contentAmount, input.contentUnit);
    if (!unitPrice) return null;
    grossRappen = unitPrice.valueRappen;
  }
  const netSalesRappen = grossRappen - vatRappen(grossRappen, input.vatRate);
  if (netSalesRappen <= 0) return null;
  const marginRappen = netSalesRappen - input.purchasePriceRappen;
  return {
    netSalesRappen,
    costRappen: input.purchasePriceRappen,
    marginRappen,
    marginBasisPoints: Math.round((marginRappen * 10_000) / netSalesRappen),
  };
}

/** 2534 -> "25.3 %". */
export function formatBasisPoints(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : "";
  const tenths = Math.round(Math.abs(basisPoints) / 10);
  return `${sign}${Math.floor(tenths / 10)}.${tenths % 10} %`;
}
