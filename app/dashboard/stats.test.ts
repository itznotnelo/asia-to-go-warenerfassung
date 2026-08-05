import { describe, expect, it } from "vitest";
import { buildCategoryCounts, computeOffHitRate } from "./stats";

describe("computeOffHitRate", () => {
  it("returns null when no OFF attempt has happened yet", () => {
    expect(computeOffHitRate({ existing_product: 5, off_hit: 0, off_miss: 0 })).toBeNull();
  });

  it("computes the hit rate from off_hit and off_miss only", () => {
    expect(computeOffHitRate({ existing_product: 100, off_hit: 3, off_miss: 1 })).toBe(0.75);
  });

  it("ignores existing_product scans entirely — those never call OFF", () => {
    const withExisting = computeOffHitRate({ existing_product: 50, off_hit: 1, off_miss: 1 });
    const withoutExisting = computeOffHitRate({ existing_product: 0, off_hit: 1, off_miss: 1 });
    expect(withExisting).toBe(withoutExisting);
  });

  it("is 0 when every OFF attempt missed", () => {
    expect(computeOffHitRate({ existing_product: 0, off_hit: 0, off_miss: 4 })).toBe(0);
  });

  it("is 1 when every OFF attempt hit", () => {
    expect(computeOffHitRate({ existing_product: 0, off_hit: 4, off_miss: 0 })).toBe(1);
  });
});

describe("buildCategoryCounts", () => {
  const categories = [
    { id: "c1", name: "Reis", parentName: "Nudeln & Reis" },
    { id: "c2", name: "Sojasauce", parentName: "Saucen & Würzen" },
    { id: "c3", name: "Currypasten", parentName: "Saucen & Würzen" },
  ];

  it("sorts descending by count", () => {
    const counts = new Map([
      ["c1", 3],
      ["c2", 10],
    ]);
    const result = buildCategoryCounts(counts, categories);
    expect(result.map((r) => r.categoryId)).toEqual(["c2", "c1"]);
  });

  it("drops categories with zero products", () => {
    const counts = new Map([["c1", 3]]);
    const result = buildCategoryCounts(counts, categories);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("c1");
  });

  it("carries the parent name through for display", () => {
    const counts = new Map([["c2", 1]]);
    const result = buildCategoryCounts(counts, categories);
    expect(result[0].parentName).toBe("Saucen & Würzen");
  });
});
