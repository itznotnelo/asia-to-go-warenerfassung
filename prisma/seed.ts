import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { isValidBarcode, normalizeGtin } from "../lib/barcode";
import { unitRuleIssues } from "../lib/unit-rules";
import { categoryTree, KIND_BY_SLUG, type CategorySeed } from "../electron/src/category-tree";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedCategories(nodes: CategorySeed[], parentId: string | null): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();

  for (const node of nodes) {
    const category = await prisma.category.upsert({
      where: { slug: node.slug },
      update: { name: node.name, sortOrder: node.sortOrder, parentId },
      create: { name: node.name, slug: node.slug, sortOrder: node.sortOrder, parentId },
    });
    idBySlug.set(node.slug, category.id);

    if (node.children) {
      const childIds = await seedCategories(node.children, category.id);
      for (const [slug, id] of childIds) idBySlug.set(slug, id);
    }
  }

  return idBySlug;
}

// Handvoll repräsentative Artikel zum Durchtesten von calcUnitPrice(),
// MwSt-Zuordnung und den drei Lagertypen. All of them are prepacked, so
// unitType is "piece" (see lib/unit-rules.ts). dataComplete bleibt bewusst auf
// dem Default `false` — es fehlt jeweils mindestens ein Produktbild.
interface ProductSeed {
  ean: string;
  sku: string;
  nameDe: string;
  nameOriginal?: string;
  brand?: string;
  originCountry?: string;
  categorySlug: string;
  priceRappen: number;
  vatRate?: number;
  unitType: "piece" | "weight" | "volume";
  contentAmount?: number;
  contentUnit?: "g" | "kg" | "ml" | "l" | "stk";
  storageType: "ambient" | "chilled" | "frozen";
  ingredientsDe?: string;
  allergens?: string[];
}

const products: ProductSeed[] = [
  {
    ean: "4710265318524",
    sku: "SAU-001",
    nameDe: "Austernsauce",
    nameOriginal: "蠔油",
    brand: "Lee Kum Kee",
    originCountry: "CN",
    categorySlug: "sojasauce-wuerzsaucen",
    priceRappen: 495,
    unitType: "piece",
    contentAmount: 510,
    contentUnit: "g",
    storageType: "ambient",
    ingredientsDe: "Zucker, Wasser, Austernextrakt, Salz, Weizenmehl, Farbstoff Karamell E150a, Verdickungsmittel Xanthan",
    allergens: ["fish", "gluten"],
  },
  {
    ean: "8850329654123",
    sku: "REI-001",
    nameDe: "Jasminreis",
    nameOriginal: "ข้าวหอมมะลิ",
    brand: "Golden Phoenix",
    originCountry: "TH",
    categorySlug: "reis",
    priceRappen: 1590,
    unitType: "piece",
    contentAmount: 5,
    contentUnit: "kg",
    storageType: "ambient",
    ingredientsDe: "Thailändischer Jasminreis",
    allergens: [],
  },
  {
    ean: "8801043017138",
    sku: "NUD-001",
    nameDe: "Shin Ramyun Instantnudeln, scharf, 5er-Pack",
    nameOriginal: "신라면",
    brand: "Nongshim",
    originCountry: "KR",
    categorySlug: "instantnudeln",
    priceRappen: 690,
    unitType: "piece",
    contentAmount: 5,
    contentUnit: "stk",
    storageType: "ambient",
    ingredientsDe: "Weizenmehl, Palmöl, Würzmischung (Chilipulver, Sojasauce, Rindfleischextrakt)",
    allergens: ["gluten", "soybeans"],
  },
  {
    ean: "6921168509256",
    sku: "TK-001",
    nameDe: "Frühlingsrollen Gemüse, tiefgekühlt",
    nameOriginal: "春卷",
    brand: "Wei-Chuan",
    originCountry: "CN",
    categorySlug: "tk-teigtaschen-dumplings",
    priceRappen: 690,
    unitType: "piece",
    contentAmount: 900,
    contentUnit: "g",
    storageType: "frozen",
    ingredientsDe: "Kohl, Weizenmehl, Karotten, Sojabohnenkeimlinge, Speiseöl, Sojasauce, Salz",
    allergens: ["gluten", "soybeans"],
  },
  {
    ean: "8801007500126",
    sku: "FRI-001",
    nameDe: "Kimchi, fermentiert",
    nameOriginal: "김치",
    brand: "Jongga",
    originCountry: "KR",
    categorySlug: "kimchi-fermentiertes",
    priceRappen: 790,
    unitType: "piece",
    contentAmount: 500,
    contentUnit: "g",
    storageType: "chilled",
    ingredientsDe: "Chinakohl, Rettich, Chilipulver, Knoblauch, Ingwer, Fischsauce, Salz, Zucker",
    allergens: ["fish"],
  },
  {
    ean: "4710420051129",
    sku: "FRI-002",
    nameDe: "Tofu naturell",
    nameOriginal: "豆腐",
    brand: "Sunlik",
    originCountry: "CH",
    categorySlug: "tofu-sojaprodukte",
    priceRappen: 350,
    unitType: "piece",
    contentAmount: 400,
    contentUnit: "g",
    storageType: "chilled",
    ingredientsDe: "Wasser, Sojabohnen, Gerinnungsmittel Calciumsulfat",
    allergens: ["soybeans"],
  },
  {
    ean: "4710114128250",
    sku: "BIE-001",
    nameDe: "Tsingtao Bier, 6er-Pack",
    nameOriginal: "青岛啤酒",
    brand: "Tsingtao",
    originCountry: "CN",
    categorySlug: "alkohol",
    priceRappen: 1290,
    vatRate: 8.1,
    unitType: "piece",
    contentAmount: 6,
    contentUnit: "stk",
    storageType: "ambient",
    ingredientsDe: "Wasser, Gerstenmalz, Reis, Hopfen",
    allergens: ["gluten"],
  },
  {
    ean: "6970399820135",
    sku: "NON-001",
    nameDe: "Bambusdampfkorb, 25 cm",
    brand: "Joyce Chen",
    originCountry: "CN",
    categorySlug: "kuechenutensilien",
    priceRappen: 1890,
    vatRate: 8.1,
    unitType: "piece",
    storageType: "ambient",
  },
];

// Runs before any write, so a typo'd seed EAN fails the whole seed instead of
// landing half-way in the database.
function assertValidSeedEans(seeds: ProductSeed[]) {
  const invalid = seeds.filter((product) => !isValidBarcode(normalizeGtin(product.ean)));
  if (invalid.length > 0) {
    const list = invalid.map((product) => `${product.sku}=${product.ean}`).join(", ");
    throw new Error(`Ungültige EAN (Format oder Prüfziffer) in Produkt-Seed: ${list}`);
  }
}

async function seedProducts(idBySlug: Map<string, string>) {
  // The seed writes past productInputSchema, so check the unit rules here.
  for (const product of products) {
    const issues = unitRuleIssues(product);
    if (issues.length > 0) {
      throw new Error(`Ungültige Einheit im Produkt-Seed ${product.sku}: ${issues.map((issue) => issue.message).join(", ")}`);
    }
  }

  for (const product of products) {
    const categoryId = idBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Unbekannter Kategorie-Slug in Produkt-Seed: ${product.categorySlug}`);
    }
    const ean = normalizeGtin(product.ean);
    // Seed categories are all in the tree, so the map lookup is the whole suggestKind rule.
    const kind = KIND_BY_SLUG.get(product.categorySlug) ?? "food";

    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        ean,
        nameDe: product.nameDe,
        nameOriginal: product.nameOriginal,
        brand: product.brand,
        originCountry: product.originCountry,
        categoryId,
        priceRappen: product.priceRappen,
        vatRate: product.vatRate ?? 2.6,
        kind,
        unitType: product.unitType,
        contentAmount: product.contentAmount,
        contentUnit: product.contentUnit,
        storageType: product.storageType,
        ingredientsDe: product.ingredientsDe,
        allergens: product.allergens ?? [],
        dataSource: "manual",
      },
      create: {
        ean,
        sku: product.sku,
        nameDe: product.nameDe,
        nameOriginal: product.nameOriginal,
        brand: product.brand,
        originCountry: product.originCountry,
        categoryId,
        priceRappen: product.priceRappen,
        vatRate: product.vatRate ?? 2.6,
        kind,
        unitType: product.unitType,
        contentAmount: product.contentAmount,
        contentUnit: product.contentUnit,
        storageType: product.storageType,
        ingredientsDe: product.ingredientsDe,
        allergens: product.allergens ?? [],
        dataSource: "manual",
      },
    });
  }
}

async function main() {
  assertValidSeedEans(products);
  const idBySlug = await seedCategories(categoryTree, null);
  await seedProducts(idBySlug);
  console.log(`Seed fertig: ${idBySlug.size} Kategorien, ${products.length} Produkte.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
