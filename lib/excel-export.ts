import type { ProductExportRow } from "@/lib/product-export";

// Excel-facing product list for Swiss Excel (de-CH) and LibreOffice. This is a
// human-readable view, not a backup: the lossless export stays in csv.ts.

const BOM = String.fromCharCode(0xfeff);
const SEPARATOR = ";";
const LINE_END = "\r\n";

// A leading tab makes the cell non-numeric, so Excel and LibreOffice keep the
// EAN as text instead of 4.71027E+12. ="..." was rejected: it only works if
// the program evaluates formulas on CSV import, which LibreOffice makes a
// per-import option. The same prefix also defuses formula injection.
const TEXT_GUARD = "\t";

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => string;
}

const COLUMNS: ExcelColumn<ProductExportRow>[] = [
  { header: "Artikelnr", value: (row) => guardFormula(row.sku) },
  { header: "EAN", value: (row) => excelBarcode(row.ean) },
  { header: "Name", value: (row) => guardFormula(row.nameDe) },
  { header: "Originalname", value: (row) => guardFormula(row.nameOriginal) },
  { header: "Kategorie", value: (row) => guardFormula(row.category) },
  { header: "Preis CHF", value: (row) => formatRappenPlain(row.priceRappen) },
  { header: "MwSt %", value: (row) => String(row.vatRate) },
  { header: "Inhalt", value: (row) => String(row.contentAmount) },
  { header: "Einheit", value: (row) => guardFormula(row.contentUnit) },
  { header: "Verfügbar", value: (row) => (row.isAvailable ? "Ja" : "Nein") },
];

/** 1250 -> "12.50". Integer math only; de-CH Excel reads '.' as the decimal separator. */
export function formatRappenPlain(rappen: number): string {
  if (!Number.isSafeInteger(rappen)) {
    throw new Error(`priceRappen must be an integer, got ${rappen}`);
  }
  const abs = Math.abs(rappen);
  const cents = abs % 100;
  const francs = (abs - cents) / 100;
  return `${rappen < 0 ? "-" : ""}${francs}.${String(cents).padStart(2, "0")}`;
}

/** Stops text that starts with = + - @ from being run as a formula (CSV injection). */
export function guardFormula(text: string): string {
  return /^[=+\-@]/.test(text) ? TEXT_GUARD + text : text;
}

function escapeField(text: string): string {
  if (/[";\r\n\t]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** An EAN/barcode kept as text in Excel (no 4.71027E+12). */
export function excelBarcode(ean: string): string {
  return ean === "" ? "" : TEXT_GUARD + ean;
}

/** Same Excel CSV format for any column list (inventory list, v0.3). */
export function toExcelCsvWith<T>(columns: ExcelColumn<T>[], rows: T[], footer: string[][] = []): string {
  const lines = [columns.map((column) => escapeField(column.header)).join(SEPARATOR)];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(column.value(row))).join(SEPARATOR));
  }
  for (const cells of footer) {
    lines.push(cells.map((cell) => escapeField(guardFormula(cell))).join(SEPARATOR));
  }
  return BOM + lines.join(LINE_END) + LINE_END;
}

/** Builds the Excel CSV: UTF-8 BOM, ';' separator, CRLF, German headers. */
export function toExcelCsv(rows: ProductExportRow[]): string {
  return toExcelCsvWith(COLUMNS, rows);
}
