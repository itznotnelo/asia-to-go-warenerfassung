import { excelBarcode, formatRappenPlain, guardFormula, toExcelCsvWith, type ExcelColumn } from "@/lib/excel-export";
import { formatStockQtyPlain, inputUnitLabel, valueRappen, type StockUnitType } from "./units";

// Year-end inventory list (Inventar) at EK, for the Swiss bookkeeping. Stock
// on the cut-off date comes from the ledger (sum of movements up to the end
// of that day); prices are the current EK per article.

export interface InventoryRow {
  sku: string;
  ean: string | null;
  nameDe: string;
  nameOriginal: string | null;
  category: string;
  unitType: StockUnitType;
  qty: number;
  purchasePriceRappen: number | null;
}

export interface InventoryLine extends InventoryRow {
  valueRappen: number | null;
}

export interface InventoryList {
  lines: InventoryLine[];
  totalRappen: number;
  /** Lines with positive stock but no EK (value missing from the total). */
  withoutCost: number;
  /** Lines with negative stock (counted as 0 in the total; should be counted again). */
  negative: number;
}

/** Only lines with stock; negative stock never adds value. Sorted by category, then name. */
export function buildInventoryList(rows: InventoryRow[]): InventoryList {
  const lines: InventoryLine[] = rows
    .filter((row) => row.qty !== 0)
    .map((row) => ({
      ...row,
      valueRappen:
        row.purchasePriceRappen === null || row.qty < 0 ? null : valueRappen(row.qty, row.unitType, row.purchasePriceRappen),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "de-CH") || a.nameDe.localeCompare(b.nameDe, "de-CH"));
  return {
    lines,
    totalRappen: lines.reduce((sum, line) => sum + (line.valueRappen ?? 0), 0),
    withoutCost: lines.filter((line) => line.qty > 0 && line.purchasePriceRappen === null).length,
    negative: lines.filter((line) => line.qty < 0).length,
  };
}

const COLUMNS: ExcelColumn<InventoryLine>[] = [
  { header: "Artikelnr", value: (line) => guardFormula(line.sku) },
  { header: "EAN", value: (line) => excelBarcode(line.ean ?? "") },
  { header: "Name", value: (line) => guardFormula(line.nameDe) },
  { header: "Originalname", value: (line) => guardFormula(line.nameOriginal ?? "") },
  { header: "Kategorie", value: (line) => guardFormula(line.category) },
  { header: "Menge", value: (line) => formatStockQtyPlain(line.qty, line.unitType) },
  { header: "Einheit", value: (line) => inputUnitLabel(line.unitType) },
  { header: "EK CHF pro Einheit", value: (line) => (line.purchasePriceRappen === null ? "" : formatRappenPlain(line.purchasePriceRappen)) },
  { header: "Wert CHF", value: (line) => (line.valueRappen === null ? "" : formatRappenPlain(line.valueRappen)) },
];

/** Swiss Excel CSV (same format as the article export) with a total row. */
export function inventoryCsv(list: InventoryList, cutoffLabel: string): string {
  return toExcelCsvWith(COLUMNS, list.lines, [
    [],
    ["", "", `Total Warenlager zu EK per ${cutoffLabel}`, "", "", "", "", "", formatRappenPlain(list.totalRappen)],
  ]);
}
