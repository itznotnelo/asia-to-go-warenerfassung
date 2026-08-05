/** RFC4180-artiges CSV: Feld in Anführungszeichen, wenn es Komma, Anführungszeichen oder Zeilenumbruch enthält. */
function escapeCsvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Baut CSV-Text aus einer Liste gleichförmiger Objekte — erste Zeile sind die Header. */
export function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const lines = [headers.map((header) => escapeCsvField(header)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvField(row[header])).join(","));
  }
  return lines.join("\r\n");
}
