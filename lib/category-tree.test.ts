import { describe, expect, it } from "vitest";
import { categoryTree, VAT_RATE_BY_SLUG, type CategorySeed } from "@/electron/src/category-tree";

function flatten(nodes: CategorySeed[]): CategorySeed[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe("category tree (shared by prisma/seed.ts and the Electron seeder)", () => {
  const all = flatten(categoryTree);

  it("has unique slugs, since both seeders upsert on slug", () => {
    const slugs = all.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contains the review's missing categories", () => {
    const byName = new Map(all.map((c) => [c.name, c.slug]));
    expect(byName.get("Kosmetik & Körperpflege")).toBe("kosmetik-koerperpflege");
    expect(byName.get("Haushalt")).toBe("haushalt");
    expect(byName.get("Öle & Essig")).toBe("oele-essig");
  });

  it("puts 8.1% on Alkohol and everything under Non-Food, nothing else", () => {
    const high = [...VAT_RATE_BY_SLUG].filter(([, rate]) => rate === 8.1).map(([slug]) => slug).sort();
    expect(high).toEqual(
      ["alkohol", "geschirr-tischkultur", "haushalt", "kosmetik-koerperpflege", "kuechenutensilien", "non-food"].sort(),
    );
  });

  it("uses Swiss spelling in category names", () => {
    expect(all.some((c) => c.name.includes(String.fromCharCode(223)))).toBe(false);
  });
});
