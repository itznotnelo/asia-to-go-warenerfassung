import { describe, expect, it } from "vitest";
import { mapAllergenTags } from "./allergens";

describe("mapAllergenTags", () => {
  it("strips the language prefix and maps to canonical keys", () => {
    expect(mapAllergenTags(["en:milk", "en:nuts", "en:soybeans"])).toEqual(
      expect.arrayContaining(["milk", "nuts", "soybeans"]),
    );
  });

  it("maps sesame-seeds and sulphites variants", () => {
    expect(mapAllergenTags(["en:sesame-seeds"])).toEqual(["sesame"]);
    expect(mapAllergenTags(["en:sulphur-dioxide-and-sulphites"])).toEqual(["sulphites"]);
  });

  it("normalizes a German-prefixed tag", () => {
    expect(mapAllergenTags(["de:milch"])).toEqual(["milk"]);
  });

  it("drops unknown tags instead of guessing", () => {
    expect(mapAllergenTags(["en:milk", "en:some-unknown-tag"])).toEqual(["milk"]);
  });

  it("de-duplicates", () => {
    expect(mapAllergenTags(["en:milk", "en:milk"])).toEqual(["milk"]);
  });

  it("handles undefined and empty input", () => {
    expect(mapAllergenTags(undefined)).toEqual([]);
    expect(mapAllergenTags([])).toEqual([]);
  });
});
