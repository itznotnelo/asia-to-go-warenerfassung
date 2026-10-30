import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductExportRow } from "@/lib/product-export";

const ROW: ProductExportRow = {
  id: "p1",
  sku: "ASIA-00001",
  ean: "7612345678904",
  nameDe: "Reisnudeln",
  nameOriginal: "",
  nameEn: "",
  brand: "",
  originCountry: "TH",
  category: "Nudeln",
  priceRappen: 1250,
  vatRate: 2.6,
  unitType: "piece",
  contentAmount: 400,
  contentUnit: "g",
  storageType: "ambient",
  ingredientsDe: "",
  allergens: "",
  traces: "",
  allergensConfirmedAt: "",
  isAvailable: true,
  stockQty: "",
  dataSource: "manual",
  dataComplete: true,
  notes: "",
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
};

const findManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { product: { findMany: findManyMock } } }));
vi.mock("@/lib/product-export", () => ({ toExportRow: (row: ProductExportRow) => row }));

const { GET } = await import("./route");

const get = (query: string) => GET(new Request(`http://127.0.0.1:3000/api/export${query}`));

describe("GET /api/export", () => {
  beforeEach(() => findManyMock.mockResolvedValue([ROW]));

  it("serves the Excel view for format=excel", async () => {
    const response = await get("?format=excel");
    expect(response.headers.get("Content-Disposition")).toMatch(/filename="artikel-excel-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Preis CHF");
    expect(body).toContain("12.50");
  });

  it("keeps the lossless csv and json exports unchanged", async () => {
    const csv = await get("?format=csv");
    expect(csv.headers.get("Content-Disposition")).toMatch(/filename="artikel-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await csv.text()).toContain("priceRappen");

    const json = await get("");
    expect(json.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(await json.text())).toEqual([ROW]);
  });

  it("falls back to json for an unknown format", async () => {
    const response = await get("?format=xlsx");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });
});
