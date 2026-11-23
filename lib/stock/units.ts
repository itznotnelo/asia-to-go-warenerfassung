// Stock units (v0.3). No imports from "@/": prisma/seed.ts uses this file too.
//
// Stock is always an Int in the article's stock unit:
// - piece (prepacked): pieces ("Stk")
// - weight (loose):    grams
// - volume (loose):    millilitres
// Purchase prices (EK) use a readable basis instead: Rappen per piece, per kg
// or per l. valueRappen() converts between the two with integer math.

export type StockUnitType = "piece" | "weight" | "volume";

/** Unit stock quantities are stored in. */
export function stockUnitLabel(unitType: StockUnitType): string {
  return unitType === "piece" ? "Stk" : unitType === "weight" ? "g" : "ml";
}

/** Unit people type quantities in (kg / l for loose goods). */
export function inputUnitLabel(unitType: StockUnitType): string {
  return unitType === "piece" ? "Stk" : unitType === "weight" ? "kg" : "l";
}

/** What the EK refers to: "pro Stk", "pro kg", "pro l". */
export function costBasisLabel(unitType: StockUnitType): string {
  return `pro ${inputUnitLabel(unitType)}`;
}

/** Stock units per input unit: 1 for pieces, 1000 for kg -> g and l -> ml. */
function inputFactor(unitType: StockUnitType): number {
  return unitType === "piece" ? 1 : 1000;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

/** 12 -> "12 Stk", 750 g -> "750 g", 1250 g -> "1.25 kg", -3 -> "-3 Stk". */
export function formatStockQty(qty: number, unitType: StockUnitType): string {
  if (!Number.isSafeInteger(qty)) throw new RangeError(`stock quantity must be an integer, got ${qty}`);
  const sign = qty < 0 ? "-" : "";
  const abs = Math.abs(qty);
  if (unitType === "piece") return `${sign}${groupThousands(String(abs))} Stk`;
  const small = unitType === "weight" ? "g" : "ml";
  const big = unitType === "weight" ? "kg" : "l";
  if (abs < 1000) return `${sign}${abs} ${small}`;
  const whole = Math.floor(abs / 1000);
  const fraction = String(abs % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${groupThousands(String(whole))}${fraction ? `.${fraction}` : ""} ${big}`;
}

/** Plain number for exports: pieces as is, loose goods in kg / l with 3 decimals ("1.250"). */
export function formatStockQtyPlain(qty: number, unitType: StockUnitType): string {
  if (unitType === "piece") return String(qty);
  const sign = qty < 0 ? "-" : "";
  const abs = Math.abs(qty);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
}

/**
 * Parses what someone typed into a stock quantity. Pieces: whole numbers only.
 * Loose goods: kg / l with up to 3 decimals, "," or "." ("2,5" -> 2500 g).
 * Returns null instead of guessing. `allowNegative` for manual corrections.
 */
export function parseQtyInput(input: string, unitType: StockUnitType, allowNegative = false): number | null {
  const raw = input.trim().replace(/['’\s]/g, "");
  const match = /^(-)?(\d+)(?:[.,](\d{1,3}))?$/.exec(raw);
  if (!match) return null;
  const [, minus, whole, fraction] = match;
  if (minus && !allowNegative) return null;
  if (unitType === "piece" && fraction !== undefined) return null;
  const factor = inputFactor(unitType);
  const value = Number(whole) * factor + (fraction === undefined ? 0 : Number(fraction.padEnd(3, "0")));
  if (!Number.isSafeInteger(value)) return null;
  return minus ? -value : value;
}

/** Stock quantity back into the input unit, for pre-filling a field (2500 g -> "2.5"). */
export function qtyToInput(qty: number, unitType: StockUnitType): string {
  if (unitType === "piece") return String(qty);
  return formatStockQtyPlain(qty, unitType).replace(/\.?0+$/, "");
}

/**
 * Value of a stock quantity at a purchase price (EK) in Rappen per piece /
 * kg / l. Integer math, rounded once to whole Rappen.
 */
export function valueRappen(qty: number, unitType: StockUnitType, costRappen: number): number {
  if (!Number.isSafeInteger(qty) || !Number.isSafeInteger(costRappen)) {
    throw new RangeError(`qty and costRappen must be integers, got ${qty} / ${costRappen}`);
  }
  if (unitType === "piece") return qty * costRappen;
  return Math.round((qty * costRappen) / 1000);
}

/** Cartons/packs to stock units: 3 cartons of 24 = 72. */
export function packsToQty(packs: number, packSize: number): number {
  if (!Number.isSafeInteger(packs) || !Number.isSafeInteger(packSize) || packSize < 1) {
    throw new RangeError(`packs and packSize must be integers, packSize >= 1 (got ${packs} / ${packSize})`);
  }
  return packs * packSize;
}

/** "3 Karton à 24 Stk" or "2 Karton à 24 Stk + 5 Stk"; plain "5 Stk" when packSize is 1. */
export function formatPacks(qty: number, packSize: number, unitType: StockUnitType): string {
  if (packSize <= 1 || qty < packSize) return formatStockQty(qty, unitType);
  const packs = Math.floor(qty / packSize);
  const rest = qty % packSize;
  const packText = `${packs} Karton à ${formatStockQty(packSize, unitType)}`;
  return rest === 0 ? packText : `${packText} + ${formatStockQty(rest, unitType)}`;
}
