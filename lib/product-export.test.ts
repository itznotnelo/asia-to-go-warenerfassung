import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toExportRow } from "./product-export";
import type { Category, Product } from "@/lib/generated/prisma/client";

const category: Category = {
  id: "cat-1",
  name: "Sojasauce & Würzsaucen",
  slug: "sojasauce-wuerzsaucen",
  sortOrder: 10,
  parentId: "cat-parent",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const product: Product = {
  id: "p1",
  ean: "3017620422003",
  sku: "ASIA-00001",
  nameDe: "Austernsauce",
  nameOriginal: "蠔油",
  nameEn: null,
  brand: "Lee Kum Kee",
  originCountry: "CN",
  categoryId: "cat-1",
  priceRappen: 495,
  vatRate: new Prisma.Decimal(2.6),
  unitType: "weight",
  contentAmount: new Prisma.Decimal(510),
  contentUnit: "g",
  storageType: "ambient",
  ingredientsDe: "Zucker, Wasser",
  allergens: ["fish", "gluten"],
  nutrition: null,
  isAvailable: true,
  stockQty: null,
  dataSource: "manual",
  dataComplete: false,
  notes: null,
  createdAt: new Date("2026-01-02T10:00:00.000Z"),
  updatedAt: new Date("2026-01-03T11:00:00.000Z"),
};

describe("toExportRow", () => {
  it("converts Decimal fields to plain numbers", () => {
    const row = toExportRow({ ...product, category });
    expect(row.vatRate).toBe(2.6);
    expect(row.contentAmount).toBe(510);
  });

  it("joins allergens with a semicolon", () => {
    const row = toExportRow({ ...product, category });
    expect(row.allergens).toBe("fish;gluten");
  });

  it("uses the category name, not the id", () => {
    const row = toExportRow({ ...product, category });
    expect(row.category).toBe("Sojasauce & Würzsaucen");
  });

  it("renders nullable fields as empty strings, not null", () => {
    const row = toExportRow({ ...product, category, nameOriginal: null, notes: null });
    expect(row.nameOriginal).toBe("");
    expect(row.notes).toBe("");
  });

  it("renders a missing contentAmount as an empty string, not 0", () => {
    const row = toExportRow({ ...product, category, contentAmount: null });
    expect(row.contentAmount).toBe("");
  });

  it("formats timestamps as ISO strings", () => {
    const row = toExportRow({ ...product, category });
    expect(row.createdAt).toBe("2026-01-02T10:00:00.000Z");
  });
});
