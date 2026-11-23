import { describe, expect, it } from "vitest";
import { KIND_OPTIONS, needsFoodLabelling, PRODUCT_KINDS, suggestKind } from "./product-kind";

describe("suggestKind (#27)", () => {
  it("takes the kind from the slug, so a renamed category keeps it", () => {
    expect(suggestKind({ slug: "alkohol", parentSlug: "getraenke" })).toBe("alcohol");
    expect(suggestKind({ slug: "kuechenutensilien", parentSlug: "non-food" })).toBe("non_food");
    expect(suggestKind({ slug: "kosmetik-koerperpflege", parentSlug: "non-food" })).toBe("cosmetics");
  });

  it("lets an unknown sub-category inherit from its parent", () => {
    expect(suggestKind({ slug: "raeucherstaebchen", parentSlug: "non-food" })).toBe("non_food");
    expect(suggestKind({ slug: "neu", parentSlug: "nudeln-reis" })).toBe("food");
  });

  it("falls back to food, the strictest rules", () => {
    expect(suggestKind({ slug: "reis", parentSlug: "nudeln-reis" })).toBe("food");
    expect(suggestKind(undefined)).toBe("food");
    expect(suggestKind(null)).toBe("food");
  });
});

describe("needsFoodLabelling", () => {
  it("is true for food and alcohol only", () => {
    expect(PRODUCT_KINDS.filter(needsFoodLabelling)).toEqual(["food", "alcohol"]);
  });
});

describe("KIND_OPTIONS", () => {
  it("offers every kind exactly once, in schema order", () => {
    expect(KIND_OPTIONS.map((option) => option.kind)).toEqual([...PRODUCT_KINDS]);
  });

  it("uses Swiss spelling", () => {
    expect(KIND_OPTIONS.some((option) => option.label.includes(String.fromCharCode(223)))).toBe(false);
  });
});
