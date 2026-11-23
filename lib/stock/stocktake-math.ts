import { valueRappen, type StockUnitType } from "./units";

export interface CountedLine {
  productId: string;
  countedQty: number;
  /** Stock the app expected when the line was counted. */
  expectedQty: number;
  unitType: StockUnitType;
  purchasePriceRappen: number | null;
}

export interface DiffLine extends CountedLine {
  diff: number;
  /** Value of the difference at EK; null without EK. */
  diffValueRappen: number | null;
}

/** Correction to book: counted minus what was expected at count time. */
export function correctionFor(line: Pick<CountedLine, "countedQty" | "expectedQty">): number {
  return line.countedQty - line.expectedQty;
}

/** What booking a stock count will change: applied to the stock at booking time. */
export function stockAfterCount(stockAtBooking: number, line: Pick<CountedLine, "countedQty" | "expectedQty">): number {
  return stockAtBooking + correctionFor(line);
}

export interface DiffSummary {
  lines: DiffLine[];
  counted: number;
  changed: number;
  plusValueRappen: number;
  minusValueRappen: number;
  /** Lines with a difference but no EK, so the value total is incomplete. */
  withoutCost: number;
}

/** The diff list shown before booking: changed lines first, biggest value difference on top. */
export function stocktakeDiff(lines: CountedLine[]): DiffSummary {
  const withDiff: DiffLine[] = lines.map((line) => {
    const diff = correctionFor(line);
    return {
      ...line,
      diff,
      diffValueRappen: line.purchasePriceRappen === null ? null : valueRappen(diff, line.unitType, line.purchasePriceRappen),
    };
  });
  withDiff.sort((a, b) => {
    if ((a.diff === 0) !== (b.diff === 0)) return a.diff === 0 ? 1 : -1;
    return Math.abs(b.diffValueRappen ?? 0) - Math.abs(a.diffValueRappen ?? 0);
  });
  let plus = 0;
  let minus = 0;
  let withoutCost = 0;
  for (const line of withDiff) {
    if (line.diff === 0) continue;
    if (line.diffValueRappen === null) withoutCost += 1;
    else if (line.diffValueRappen > 0) plus += line.diffValueRappen;
    else minus += line.diffValueRappen;
  }
  return {
    lines: withDiff,
    counted: lines.length,
    changed: withDiff.filter((line) => line.diff !== 0).length,
    plusValueRappen: plus,
    minusValueRappen: minus,
    withoutCost,
  };
}
