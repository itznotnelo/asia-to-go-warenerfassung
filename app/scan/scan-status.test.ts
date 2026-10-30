import { describe, expect, it } from "vitest";
import { presentStatus } from "./scan-status";
import type { ProductSummary } from "@/lib/product-summary";

describe("scan status texts (#39)", () => {
  const ean = "4006381333931";

  it("says 'online' instead of OFF or Open Food Facts", () => {
    const texts = [
      presentStatus({ status: "new-hit", ean, mapped: { allergens: [], traces: [], imageUrls: {} } }),
      presentStatus({ status: "new-miss", ean }),
      presentStatus({ status: "off-error", ean }),
      presentStatus({ status: "no-barcode" }),
    ].flatMap((p) => [p.label, p.detail ?? ""]);

    expect(texts).toContain("Neuer Artikel: online gefunden");
    expect(texts).toContain("Neuer Artikel: nicht online gefunden");
    expect(texts).toContain("Online-Suche geht gerade nicht");
    expect(texts).toContain(`${ean}: bitte von Hand erfassen`);
    for (const text of texts) {
      expect(text).not.toMatch(/\bOFF\b|Open Food Facts|—|–/);
    }
  });

  it("says an archived article is gelöscht, with name and SKU", () => {
    const product = { nameDe: "Reisnudeln", sku: "ASIA-00042" } as ProductSummary;
    const presentation = presentStatus({ status: "archived", product });
    expect(presentation.label).toBe("Artikel ist gelöscht");
    expect(presentation.detail).toBe("Reisnudeln · ASIA-00042");
  });
});
