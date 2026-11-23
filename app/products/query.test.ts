import { describe, expect, it } from "vitest";
import { buildProductWhere } from "./query";

const ACTIVE = { archivedAt: null };

describe("buildProductWhere", () => {
  it("returns only active (not archived) articles when nothing is set", () => {
    expect(buildProductWhere({})).toEqual(ACTIVE);
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
    expect(buildProductWhere({ q: "   " })).toEqual(ACTIVE);
  });

  it("filters by category", () => {
    expect(buildProductWhere({ categoryId: "cat-1" })).toEqual({ ...ACTIVE, categoryId: "cat-1" });
  });

  it("only accepts known storageType and dataSource values", () => {
    expect(buildProductWhere({ storageType: "frozen" })).toEqual({ ...ACTIVE, storageType: "frozen" });
    expect(buildProductWhere({ storageType: "not-a-real-value" })).toEqual(ACTIVE);
    expect(buildProductWhere({ dataSource: "manual" })).toEqual({ ...ACTIVE, dataSource: "manual" });
    expect(buildProductWhere({ dataSource: "bogus" })).toEqual(ACTIVE);
  });

  it("maps complete to a boolean dataComplete filter", () => {
    expect(buildProductWhere({ complete: "true" })).toEqual({ ...ACTIVE, dataComplete: true });
    expect(buildProductWhere({ complete: "false" })).toEqual({ ...ACTIVE, dataComplete: false });
    expect(buildProductWhere({ complete: "" })).toEqual(ACTIVE);
  });

  it("combines multiple filters", () => {
    const where = buildProductWhere({ categoryId: "cat-1", storageType: "chilled", complete: "false" });
    expect(where).toEqual({ ...ACTIVE, categoryId: "cat-1", storageType: "chilled", dataComplete: false });
  });

  it("shows only archived articles in the Gelöscht view, and treats any other value as active", () => {
    expect(buildProductWhere({ archived: "true" })).toEqual({ archivedAt: { not: null } });
    expect(buildProductWhere({ archived: "true", q: "reis" }).archivedAt).toEqual({ not: null });
    expect(buildProductWhere({ archived: "yes" })).toEqual(ACTIVE);
  });
});
