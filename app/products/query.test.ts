import { describe, expect, it } from "vitest";
import { buildProductWhere } from "./query";

describe("buildProductWhere", () => {
  it("returns an empty filter when nothing is set", () => {
    expect(buildProductWhere({})).toEqual({});
  });

  it("builds a case-insensitive OR search across name/original/sku, and a plain contains on ean", () => {
    const where = buildProductWhere({ q: "sojasauce" });
    expect(where.OR).toEqual([
      { nameDe: { contains: "sojasauce", mode: "insensitive" } },
      { nameOriginal: { contains: "sojasauce", mode: "insensitive" } },
      { sku: { contains: "sojasauce", mode: "insensitive" } },
      { ean: { contains: "sojasauce" } },
    ]);
  });

  it("ignores a blank search string", () => {
    expect(buildProductWhere({ q: "   " })).toEqual({});
  });

  it("filters by category", () => {
    expect(buildProductWhere({ categoryId: "cat-1" })).toEqual({ categoryId: "cat-1" });
  });

  it("only accepts known storageType and dataSource values", () => {
    expect(buildProductWhere({ storageType: "frozen" })).toEqual({ storageType: "frozen" });
    expect(buildProductWhere({ storageType: "not-a-real-value" })).toEqual({});
    expect(buildProductWhere({ dataSource: "manual" })).toEqual({ dataSource: "manual" });
    expect(buildProductWhere({ dataSource: "bogus" })).toEqual({});
  });

  it("maps complete to a boolean dataComplete filter", () => {
    expect(buildProductWhere({ complete: "true" })).toEqual({ dataComplete: true });
    expect(buildProductWhere({ complete: "false" })).toEqual({ dataComplete: false });
    expect(buildProductWhere({ complete: "" })).toEqual({});
  });

  it("combines multiple filters", () => {
    const where = buildProductWhere({ categoryId: "cat-1", storageType: "chilled", complete: "false" });
    expect(where).toEqual({ categoryId: "cat-1", storageType: "chilled", dataComplete: false });
  });
});
