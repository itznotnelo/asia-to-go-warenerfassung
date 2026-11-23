import { valueRappen, type StockUnitType } from "./units";

/** "Ladenhüter": stock on hand but no movement for this many days. */
export const DEAD_STOCK_DAYS = 60;
const DAY_MS = 86_400_000;

export interface StockedProduct {
  id: string;
  unitType: StockUnitType;
  stockQty: number;
  purchasePriceRappen: number | null;
  minStock: number | null;
  lastMovementAt: Date | null;
}

export interface StockValue {
  valueRappen: number;
  /** Articles with positive stock but no EK: not in the value. */
  withoutCost: number;
}

/** Stock value at EK over all articles with positive stock. Negative stock adds nothing. */
export function stockValue(products: Pick<StockedProduct, "unitType" | "stockQty" | "purchasePriceRappen">[]): StockValue {
  let total = 0;
  let withoutCost = 0;
  for (const product of products) {
    if (product.stockQty <= 0) continue;
    if (product.purchasePriceRappen === null) {
      withoutCost += 1;
      continue;
    }
    total += valueRappen(product.stockQty, product.unitType, product.purchasePriceRappen);
  }
  return { valueRappen: total, withoutCost };
}

/** Positive stock and no movement at all for DEAD_STOCK_DAYS days. */
export function isDeadStock(product: Pick<StockedProduct, "stockQty" | "lastMovementAt">, now: Date, days = DEAD_STOCK_DAYS): boolean {
  if (product.stockQty <= 0) return false;
  if (!product.lastMovementAt) return true;
  return now.getTime() - product.lastMovementAt.getTime() >= days * DAY_MS;
}

/** At or below the reorder point, but not negative (negative has its own warning). */
export function isLowStock(product: Pick<StockedProduct, "stockQty" | "minStock">): boolean {
  return product.minStock !== null && product.stockQty >= 0 && product.stockQty <= product.minStock;
}

export function isNegativeStock(product: Pick<StockedProduct, "stockQty">): boolean {
  return product.stockQty < 0;
}
