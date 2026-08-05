import { describe, expect, it } from "vitest";
import { mapOffToProduct } from "./mapping";
import { offResponseSchema } from "./schema";

/**
 * Fixtures sind reale (leicht gekürzte) Antworten von
 * world.openfoodfacts.org/api/v2/product/{barcode}.json, abgerufen beim
 * Schreiben dieses Clients — keine erfundene Struktur.
 */
function parseFixture(raw: unknown) {
  const parsed = offResponseSchema.parse(raw);
  if (!parsed.product) throw new Error("Fixture hat kein product-Feld");
  return parsed.product;
}

const nutellaRaw = {
  status: 1,
  status_verbose: "product found",
  product: {
    code: "3017620422003",
    product_name: "Nutella",
    product_name_de: "Nutella",
    brands: "Nutella, Ferrero, Yum yum",
    quantity: "",
    countries_tags: ["en:france"],
    image_front_url: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg",
    image_ingredients_url: "https://images.openfoodfacts.org/images/products/301/762/042/2003/ingredients_en.821.400.jpg",
    image_nutrition_url: "https://images.openfoodfacts.org/images/products/301/762/042/2003/nutrition_en.822.400.jpg",
    ingredients_text_de:
      "Zucker, Palmöl, HASELNÜSSE 13 %, MAGERMILCHPULVER 8,7 %, fettarmer Kakao, Emulgator Lecithine (Soja), Vanillin",
    allergens_tags: ["en:milk", "en:nuts", "en:soybeans"],
    traces_tags: [],
    nutriments: {
      "energy-kcal_100g": 539,
      fat_100g: 30.9,
      "saturated-fat_100g": 10.6,
      carbohydrates_100g: 57.5,
      sugars_100g: 56.3,
      proteins_100g: 6.3,
      salt_100g: 0.107,
    },
  },
};

const cocaColaRaw = {
  status: 1,
  status_verbose: "product found",
  product: {
    code: "5449000000996",
    product_name: "coca-cola",
    quantity: "33 cl",
    countries_tags: ["en:switzerland", "en:germany"],
    allergens_tags: [],
    traces_tags: [],
  },
};

// Barcode 8801043017135 (Shin Ramyun) — echte Antwort war "product not found".
const missRaw = { code: "8801043017135", status: 0, status_verbose: "product not found" };

describe("mapOffToProduct", () => {
  it("maps a full hit (Nutella)", () => {
    const mapped = mapOffToProduct(parseFixture(nutellaRaw));
    expect(mapped.nameDe).toBe("Nutella");
    expect(mapped.nameOriginal).toBeUndefined();
    expect(mapped.brand).toBe("Nutella");
    expect(mapped.allergens).toEqual(expect.arrayContaining(["milk", "nuts", "soybeans"]));
    expect(mapped.contentAmount).toBeUndefined(); // quantity war leer
    expect(mapped.nutrition?.energyKcal100g).toBe(539);
    expect(mapped.imageUrls.front).toContain("front_en");
  });

  it("parses a cl quantity into ml", () => {
    const mapped = mapOffToProduct(parseFixture(cocaColaRaw));
    expect(mapped.contentAmount).toBe(330);
    expect(mapped.contentUnit).toBe("ml");
    expect(mapped.nameDe).toBe("coca-cola");
  });

  it("puts a non-Latin product name into nameOriginal, not nameDe", () => {
    const mapped = mapOffToProduct(
      parseFixture({
        status: 1,
        product: { code: "8801007500128", product_name: "김치" },
      }),
    );
    expect(mapped.nameOriginal).toBe("김치");
    expect(mapped.nameDe).toBeUndefined();
  });

  it("rejects a response without a product field at schema level", () => {
    const parsed = offResponseSchema.parse(missRaw);
    expect(parsed.product).toBeUndefined();
  });

  it("returns empty arrays, not undefined, when nothing is set", () => {
    const mapped = mapOffToProduct(parseFixture({ status: 1, product: { code: "0" } }));
    expect(mapped.allergens).toEqual([]);
    expect(mapped.traces).toEqual([]);
    expect(mapped.nutrition).toBeUndefined();
  });
});
