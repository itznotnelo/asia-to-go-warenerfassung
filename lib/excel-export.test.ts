import { describe, expect, it } from "vitest";
import { formatRappenPlain, toExcelCsv } from "./excel-export";
import type { ProductExportRow } from "./product-export";

const base: ProductExportRow = {
  id: "p1",
  sku: "SAU-001",
  ean: "4710265318524",
  nameDe: "Austernsauce",
  nameOriginal: "蠔油",
  nameEn: "",
  brand: "Lee Kum Kee",
  originCountry: "CN",
  category: "Sojasauce & Würzsaucen",
  priceRappen: 1250,
  vatRate: 2.6,
  unitType: "weight",
  contentAmount: 510,
  contentUnit: "g",
  storageType: "ambient",
  ingredientsDe: "",
  allergens: "fish;gluten",
  isAvailable: true,
  stockQty: "",
  dataSource: "manual",
  dataComplete: false,
  notes: "",
  createdAt: "2026-01-02T10:00:00.000Z",
  updatedAt: "2026-01-03T11:00:00.000Z",
};

// Minimal reader for the format we write: ';' separator, '"' quoting, CRLF.
function parse(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\r" && csv[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += char;
    }
  }
  return rows;
}

function body(csv: string): string[][] {
  return parse(csv.slice(1)).slice(1);
}

describe("toExcelCsv", () => {
  it("starts with a UTF-8 BOM", () => {
    const csv = toExcelCsv([base]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Buffer.from(csv, "utf8").subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it("writes German headers with ';' and CRLF", () => {
    const csv = toExcelCsv([base]);
    expect(csv.slice(1).split("\r\n")[0]).toBe(
      "Artikelnr;EAN;Name;Originalname;Kategorie;Preis CHF;MwSt %;Inhalt;Einheit;Verfügbar",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("keeps a 13-digit EAN as text and round-trips it", () => {
    const [row] = body(toExcelCsv([{ ...base, ean: "7610200012345" }]));
    expect(row[1]).toBe("\t7610200012345");
    expect(row[1].trim()).toBe("7610200012345");
  });

  it("keeps an EAN with a leading zero", () => {
    const [row] = body(toExcelCsv([{ ...base, ean: "0012345678905" }]));
    expect(row[1].trim()).toBe("0012345678905");
  });

  it("leaves a missing EAN empty", () => {
    const [row] = body(toExcelCsv([{ ...base, ean: "" }]));
    expect(row[1]).toBe("");
  });

  it("formats 1250 Rappen as 12.50", () => {
    const [row] = body(toExcelCsv([base]));
    expect(row[5]).toBe("12.50");
  });

  it("formats prices with integer math", () => {
    expect(formatRappenPlain(1250)).toBe("12.50");
    expect(formatRappenPlain(495)).toBe("4.95");
    expect(formatRappenPlain(5)).toBe("0.05");
    expect(formatRappenPlain(0)).toBe("0.00");
    expect(formatRappenPlain(129990)).toBe("1299.90");
    expect(formatRappenPlain(-350)).toBe("-3.50");
    expect(formatRappenPlain(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });

  it("rejects a non-integer Rappen value", () => {
    expect(() => formatRappenPlain(12.5)).toThrow();
  });

  it("keeps Thai, Chinese and Korean names intact", () => {
    const rows = body(
      toExcelCsv([
        { ...base, nameOriginal: "ข้าวหอมมะลิ" },
        { ...base, nameOriginal: "蠔油" },
        { ...base, nameOriginal: "신라면" },
      ]),
    );
    expect(rows.map((row) => row[3])).toEqual(["ข้าวหอมมะลิ", "蠔油", "신라면"]);
  });

  it("escapes ';', quotes and line breaks in a name", () => {
    const nameDe = 'Sauce "scharf"; 2 Stück\nneu';
    const csv = toExcelCsv([{ ...base, nameDe }]);
    expect(csv).toContain('"Sauce ""scharf""; 2 Stück\nneu"');
    const [row] = body(csv);
    expect(row).toHaveLength(10);
    expect(row[2]).toBe(nameDe);
  });

  it("neutralises text that Excel would run as a formula", () => {
    const [row] = body(toExcelCsv([{ ...base, nameDe: "=HYPERLINK(\"x\")" }]));
    expect(row[2]).toBe('\t=HYPERLINK("x")');
  });

  it("writes German yes/no, VAT and content", () => {
    const [a, b] = body(
      toExcelCsv([base, { ...base, isAvailable: false, vatRate: 8.1, contentAmount: "", contentUnit: "" }]),
    );
    expect(a.slice(6)).toEqual(["2.6", "510", "g", "Ja"]);
    expect(b.slice(6)).toEqual(["8.1", "", "", "Nein"]);
  });

  it("writes only the header for an empty list", () => {
    expect(toExcelCsv([])).toBe(
      String.fromCharCode(0xfeff) +
        "Artikelnr;EAN;Name;Originalname;Kategorie;Preis CHF;MwSt %;Inhalt;Einheit;Verfügbar\r\n",
    );
  });
});
