import { describe, expect, it } from "vitest";
import { allOtherCountries, COMMON_ORIGINS, countryLabel, ISO_COUNTRY_CODES, isKnownCountryCode } from "./countries";

describe("country list for Herkunftsland", () => {
  it("covers all 249 ISO codes exactly once", () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    expect(ISO_COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
  });

  it("only lists real codes under Häufig", () => {
    expect(COMMON_ORIGINS).toHaveLength(25);
    expect(COMMON_ORIGINS.every((c) => isKnownCountryCode(c.code))).toBe(true);
  });

  it("puts every other country under Alle Länder, A to Z, without repeating Häufig", () => {
    const others = allOtherCountries();
    expect(others).toHaveLength(249 - 25);
    expect(others.some((c) => c.code === "TH")).toBe(false);
    const labels = others.map((c) => c.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "de-CH")));
  });

  it("uses the short names the shop says", () => {
    expect(countryLabel("US")).toBe("USA");
    expect(countryLabel("GB")).toBe("Grossbritannien");
    expect(countryLabel("HK")).toBe("Hongkong");
    expect(countryLabel("MO")).toBe("Macau");
    expect(countryLabel("KP")).toBe("Nordkorea");
  });

  it("uses Swiss spelling throughout", () => {
    const labels = [...COMMON_ORIGINS, ...allOtherCountries()].map((c) => c.label);
    expect(labels.join("").includes(String.fromCharCode(223))).toBe(false);
  });
});
