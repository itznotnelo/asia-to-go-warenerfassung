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

  it("turns empty-string nutriments into missing values, not 0 (#30)", () => {
    const mapped = mapOffToProduct(
      parseFixture({ status: 1, product: { code: "1", nutriments: { "energy-kcal_100g": "", fat_100g: "", salt_100g: " " } } }),
    );
    expect(mapped.nutrition).toBeUndefined();
  });

  it("keeps numeric strings and drops only the bad nutriment, instead of failing the lookup (#30)", () => {
    const mapped = mapOffToProduct(
      parseFixture({
        status: 1,
        product: {
          code: "1",
          nutriments: { "energy-kcal_100g": "120", fat_100g: "abc", sugars_100g: 250, proteins_100g: 3.5, salt_100g: { value: 1 } },
        },
      }),
    );
    expect(mapped.nutrition).toEqual({ energyKcal100g: 120, proteins100g: 3.5 });
  });

  it("ignores a nutriments field that is not an object (#30)", () => {
    const product = parseFixture({ status: 1, product: { code: "1", product_name: "Tee", nutriments: "n/a" } });
    expect(mapOffToProduct(product).nutrition).toBeUndefined();
    expect(mapOffToProduct(product).nameDe).toBe("Tee");
  });

  it("keeps https openfoodfacts.org image URLs and drops everything else (#30)", () => {
    const mapped = mapOffToProduct(
      parseFixture({
        status: 1,
        product: {
          code: "1",
          image_front_url: "https://images.openfoodfacts.org/images/products/1/front_de.3.400.jpg",
          image_ingredients_url: "http://images.openfoodfacts.org/images/products/1/ingredients_de.4.400.jpg",
          image_nutrition_url: "https://openfoodfacts.org.evil.example/n.jpg",
        },
      }),
    );
    expect(mapped.imageUrls).toEqual({ front: "https://images.openfoodfacts.org/images/products/1/front_de.3.400.jpg" });
  });

  it.each(["http://127.0.0.1:5432/", "file:///etc/passwd", "not a url", 42])("drops image URL %s without failing the lookup", (url) => {
    const mapped = mapOffToProduct(parseFixture({ status: 1, product: { code: "1", image_front_url: url } }));
    expect(mapped.imageUrls.front).toBeUndefined();
  });

  it("returns empty arrays, not undefined, when nothing is set", () => {
    const mapped = mapOffToProduct(parseFixture({ status: 1, product: { code: "0" } }));
    expect(mapped.allergens).toEqual([]);
    expect(mapped.traces).toEqual([]);
    expect(mapped.nutrition).toBeUndefined();
  });
});
