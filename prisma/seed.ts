import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface CategorySeed {
  name: string;
  slug: string;
  sortOrder: number;
  children?: CategorySeed[];
}

// Asia-Sortiment für einen Laden in Schaffhausen. Non-Food und Alkohol sind
// eigene Kategorien, damit das Erfassungsformular dort 8.1% MwSt vorschlagen
// kann — der Satz selbst hängt aber am Artikel, siehe swiss-food-compliance.
const categoryTree: CategorySeed[] = [
  {
    name: "Getränke",
    slug: "getraenke",
    sortOrder: 10,
    children: [
      { name: "Softdrinks & Säfte", slug: "softdrinks-saefte", sortOrder: 10 },
      { name: "Tee & Kaffee", slug: "tee-kaffee", sortOrder: 20 },
      { name: "Alkohol", slug: "alkohol", sortOrder: 30 },
    ],
  },
  {
    name: "Nudeln & Reis",
    slug: "nudeln-reis",
    sortOrder: 20,
    children: [
      { name: "Instantnudeln", slug: "instantnudeln", sortOrder: 10 },
      { name: "Reis", slug: "reis", sortOrder: 20 },
      { name: "Frische Nudeln & Teigwaren", slug: "frische-nudeln-teigwaren", sortOrder: 30 },
    ],
  },
  {
    name: "Saucen & Würzen",
    slug: "saucen-wuerzen",
    sortOrder: 30,
    children: [
      { name: "Sojasauce & Würzsaucen", slug: "sojasauce-wuerzsaucen", sortOrder: 10 },
      { name: "Currypasten", slug: "currypasten", sortOrder: 20 },
      { name: "Gewürze & Pulver", slug: "gewuerze-pulver", sortOrder: 30 },
    ],
  },
  {
    name: "Tiefkühlkost",
    slug: "tiefkuehlkost",
    sortOrder: 40,
    children: [
      { name: "TK-Gemüse", slug: "tk-gemuese", sortOrder: 10 },
      { name: "TK-Teigtaschen & Dumplings", slug: "tk-teigtaschen-dumplings", sortOrder: 20 },
      { name: "TK-Fisch & Meeresfrüchte", slug: "tk-fisch-meeresfruechte", sortOrder: 30 },
    ],
  },
  { name: "Konserven", slug: "konserven", sortOrder: 50 },
  { name: "Snacks & Süsswaren", slug: "snacks-suesswaren", sortOrder: 60 },
  {
    name: "Frisch & Gekühlt",
    slug: "frisch-gekuehlt",
    sortOrder: 70,
    children: [
      { name: "Tofu & Sojaprodukte", slug: "tofu-sojaprodukte", sortOrder: 10 },
      { name: "Kimchi & Fermentiertes", slug: "kimchi-fermentiertes", sortOrder: 20 },
      { name: "Frisches Gemüse & Kräuter", slug: "frisches-gemuese-kraeuter", sortOrder: 30 },
    ],
  },
  {
    name: "Non-Food",
    slug: "non-food",
    sortOrder: 80,
    children: [
      { name: "Küchenutensilien", slug: "kuechenutensilien", sortOrder: 10 },
      { name: "Geschirr & Tischkultur", slug: "geschirr-tischkultur", sortOrder: 20 },
    ],
  },
];

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
// MwSt-Zuordnung und den drei Lagertypen. dataComplete bleibt bewusst auf
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
    unitType: "weight",
    contentAmount: 510,
    contentUnit: "g",
    storageType: "ambient",
    ingredientsDe: "Zucker, Wasser, Austernextrakt, Salz, Weizenmehl, Farbstoff Karamell E150a, Verdickungsmittel Xanthan",
    allergens: ["fish", "gluten"],
  },
  {
    ean: "8850329654127",
    sku: "REI-001",
    nameDe: "Jasminreis",
    nameOriginal: "ข้าวหอมมะลิ",
    brand: "Golden Phoenix",
    originCountry: "TH",
    categorySlug: "reis",
    priceRappen: 1590,
    unitType: "weight",
    contentAmount: 5,
    contentUnit: "kg",
    storageType: "ambient",
    ingredientsDe: "Thailändischer Jasminreis",
    allergens: [],
  },
  {
    ean: "8801043017135",
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
    unitType: "weight",
    contentAmount: 900,
    contentUnit: "g",
    storageType: "frozen",
    ingredientsDe: "Kohl, Weizenmehl, Karotten, Sojabohnenkeimlinge, Speiseöl, Sojasauce, Salz",
    allergens: ["gluten", "soybeans"],
  },
  {
    ean: "8801007500128",
    sku: "FRI-001",
    nameDe: "Kimchi, fermentiert",
    nameOriginal: "김치",
    brand: "Jongga",
    originCountry: "KR",
    categorySlug: "kimchi-fermentiertes",
    priceRappen: 790,
    unitType: "weight",
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
    unitType: "weight",
    contentAmount: 400,
    contentUnit: "g",
    storageType: "chilled",
    ingredientsDe: "Wasser, Sojabohnen, Gerinnungsmittel Calciumsulfat",
    allergens: ["soybeans"],
  },
  {
    ean: "4710114128254",
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
    ean: "6970399820133",
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

async function seedProducts(idBySlug: Map<string, string>) {
  for (const product of products) {
    const categoryId = idBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Unbekannter Kategorie-Slug in Produkt-Seed: ${product.categorySlug}`);
    }

    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        ean: product.ean,
        nameDe: product.nameDe,
        nameOriginal: product.nameOriginal,
        brand: product.brand,
        originCountry: product.originCountry,
        categoryId,
        priceRappen: product.priceRappen,
        vatRate: product.vatRate ?? 2.6,
        unitType: product.unitType,
        contentAmount: product.contentAmount,
        contentUnit: product.contentUnit,
        storageType: product.storageType,
        ingredientsDe: product.ingredientsDe,
        allergens: product.allergens ?? [],
        dataSource: "manual",
      },
      create: {
        ean: product.ean,
        sku: product.sku,
        nameDe: product.nameDe,
        nameOriginal: product.nameOriginal,
        brand: product.brand,
        originCountry: product.originCountry,
        categoryId,
        priceRappen: product.priceRappen,
        vatRate: product.vatRate ?? 2.6,
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
