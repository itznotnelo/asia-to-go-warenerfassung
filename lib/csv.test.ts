import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header row from the first object's keys", () => {
    const csv = toCsv([{ a: 1, b: 2 }]);
    expect(csv).toBe("a,b\r\n1,2");
  });

  it("quotes fields containing a comma", () => {
    const csv = toCsv([{ name: "Sojasauce, süss" }]);
    expect(csv).toBe('name\r\n"Sojasauce, süss"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCsv([{ note: 'Marke "Lee Kum Kee"' }]);
    expect(csv).toBe('note\r\n"Marke ""Lee Kum Kee"""');
  });

  it("quotes fields containing a newline", () => {
    const csv = toCsv([{ note: "Zeile 1\nZeile 2" }]);
    expect(csv).toBe('note\r\n"Zeile 1\nZeile 2"');
  });

  it("renders null and undefined as empty fields", () => {
    const csv = toCsv([{ a: null, b: undefined, c: "x" }]);
    expect(csv).toBe("a,b,c\r\n,,x");
  });

  it("handles multiple rows", () => {
    const csv = toCsv([
      { sku: "ASIA-00001", price: 495 },
      { sku: "ASIA-00002", price: 1290 },
    ]);
    expect(csv).toBe("sku,price\r\nASIA-00001,495\r\nASIA-00002,1290");
  });
});
