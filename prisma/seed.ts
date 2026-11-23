import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { isValidBarcode, normalizeGtin } from "../lib/barcode";
import { unitRuleIssues } from "../lib/unit-rules";
import { categoryTree, KIND_BY_SLUG, type CategorySeed } from "../electron/src/category-tree";
import { derivedAvailability, DEFAULT_SHOP_SAFETY_BUFFER } from "../lib/stock/availability";

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

// ---- Stock (v0.3): suppliers, one booked delivery per article with lots,
// some shop sales and a write-off, so every stock page has something to
// show. Written straight to the tables (the ledger lives behind
// "server-only"), keeping the same invariant: stockQty = sum of movements,
// isAvailable derived from stock. Skipped when any movement exists, so a
// second seed run never doubles the stock.

const DAY_MS = 86_400_000;

interface StockSeed {
  sku: string;
  supplier: string;
  packs: number;
  packSize: number;
  costRappen: number;
  minStock?: number;
  reorderQty?: number;
  /** One lot per entry: quantity (stock units) and MHD in days from today (null = none). */
  lots: { qty: number; expiresInDays: number | null; batch?: string }[];
  receivedDaysAgo: number;
  soldPerDay?: number[];
  waste?: { qty: number; reason: "expired" | "damaged" | "spoiled" | "other" };
}

const suppliers = [
  { name: "Asia Express Grosshandel", contactName: "Frau Lim", phone: "+41 44 000 10 20", email: "bestellung@asia-express.example", customerNumber: "AE-2231", notes: "Liefert Dienstag und Freitag. Mindestbestellung CHF 300." },
  { name: "Tak Wah Import", contactName: "Herr Chan", phone: "+41 61 000 30 40", email: null, customerNumber: "10458", notes: "Bestellung per WhatsApp." },
  { name: "Sunlik Tofurei", contactName: null, phone: "+41 52 000 50 60", email: null, customerNumber: null, notes: "Frischware, jede Woche." },
];

const stockSeeds: StockSeed[] = [
  { sku: "SAU-001", supplier: "Asia Express Grosshandel", packs: 2, packSize: 12, costRappen: 290, minStock: 6, lots: [{ qty: 24, expiresInDays: 400, batch: "L2611" }], receivedDaysAgo: 20, soldPerDay: [1, 2, 0, 1, 1] },
  { sku: "REI-001", supplier: "Asia Express Grosshandel", packs: 1, packSize: 4, costRappen: 1050, minStock: 4, reorderQty: 8, lots: [{ qty: 4, expiresInDays: 300 }], receivedDaysAgo: 15, soldPerDay: [1] },
  { sku: "NUD-001", supplier: "Tak Wah Import", packs: 1, packSize: 8, costRappen: 420, minStock: 6, reorderQty: 16, lots: [{ qty: 8, expiresInDays: 180 }], receivedDaysAgo: 12, soldPerDay: [2, 1, 2] },
  { sku: "TK-001", supplier: "Tak Wah Import", packs: 1, packSize: 10, costRappen: 390, minStock: 3, lots: [{ qty: 10, expiresInDays: 200 }], receivedDaysAgo: 10, soldPerDay: [1, 1] },
  { sku: "FRI-001", supplier: "Asia Express Grosshandel", packs: 1, packSize: 12, costRappen: 480, minStock: 4, lots: [{ qty: 12, expiresInDays: 20 }], receivedDaysAgo: 8, soldPerDay: [2, 2] },
  { sku: "FRI-002", supplier: "Sunlik Tofurei", packs: 16, packSize: 1, costRappen: 170, minStock: 5, reorderQty: 20, lots: [{ qty: 10, expiresInDays: 5 }, { qty: 6, expiresInDays: 12 }], receivedDaysAgo: 4, soldPerDay: [2, 2], waste: { qty: 1, reason: "damaged" } },
  { sku: "BIE-001", supplier: "Tak Wah Import", packs: 4, packSize: 4, costRappen: 820, minStock: 4, lots: [{ qty: 16, expiresInDays: 250 }], receivedDaysAgo: 6, soldPerDay: [1, 2] },
  { sku: "NON-001", supplier: "Asia Express Grosshandel", packs: 6, packSize: 1, costRappen: 950, lots: [{ qty: 6, expiresInDays: null }], receivedDaysAgo: 70 },
];

async function seedStock() {
  if ((await prisma.stockMovement.count()) > 0) {
    console.log("Lager: schon Buchungen vorhanden, nichts geändert.");
    return;
  }
  await prisma.stockSettings.upsert({ where: { id: 1 }, create: { id: 1, shopSafetyBuffer: DEFAULT_SHOP_SAFETY_BUFFER }, update: {} });

  const supplierIds = new Map<string, string>();
  for (const supplier of suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { name: supplier.name } });
    supplierIds.set(supplier.name, (existing ?? (await prisma.supplier.create({ data: supplier }))).id);
  }

  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  for (const seed of stockSeeds) {
    const product = await prisma.product.findUnique({ where: { sku: seed.sku } });
    if (!product) throw new Error(`Lager-Seed: Artikel ${seed.sku} fehlt`);
    const supplierId = supplierIds.get(seed.supplier) ?? null;
    const receivedAt = new Date(Date.now() - seed.receivedDaysAgo * DAY_MS);
    const quantity = seed.lots.reduce((sum, lot) => sum + lot.qty, 0);
    let stock = 0;

    const receipt = await prisma.goodsReceipt.create({
      data: { supplierId, status: "booked", deliveryNote: `LS-${seed.sku}`, bookedAt: receivedAt, createdAt: receivedAt },
    });
    let tick = 0;
    for (const lot of seed.lots) {
      const expiryDate = lot.expiresInDays === null ? null : new Date(today.getTime() + lot.expiresInDays * DAY_MS);
      // Whole cartons where the lot divides evenly, single pieces otherwise.
      const packSize = lot.qty % seed.packSize === 0 ? seed.packSize : 1;
      await prisma.goodsReceiptLine.create({
        data: { receiptId: receipt.id, productId: product.id, packs: lot.qty / packSize, packSize, quantity: lot.qty, unitCostRappen: seed.costRappen, expiryDate, batchCode: lot.batch ?? null, createdAt: receivedAt },
      });
      const stockLot = await prisma.stockLot.create({
        data: { productId: product.id, supplierId, expiryDate, batchCode: lot.batch ?? null, receivedAt },
      });
      stock += lot.qty;
      await prisma.stockMovement.create({
        data: { productId: product.id, type: "receipt", quantity: lot.qty, stockAfter: stock, unitCostRappen: seed.costRappen, supplierId, lotId: stockLot.id, goodsReceiptId: receipt.id, note: `Lieferschein LS-${seed.sku}`, createdAt: new Date(receivedAt.getTime() + tick++ * 1000) },
      });
    }
    if (stock !== quantity) throw new Error("seed stock mismatch");

    for (const [day, sold] of (seed.soldPerDay ?? []).entries()) {
      for (let i = 0; i < sold; i++) {
        stock -= 1;
        await prisma.stockMovement.create({
          data: { productId: product.id, type: "sale_shop", quantity: -1, stockAfter: stock, createdAt: new Date(receivedAt.getTime() + (day + 1) * DAY_MS / 2 + i * 60_000) },
        });
      }
    }
    if (seed.waste) {
      stock -= seed.waste.qty;
      await prisma.stockMovement.create({
        data: { productId: product.id, type: "waste", quantity: -seed.waste.qty, stockAfter: stock, wasteReason: seed.waste.reason, note: "Packung beim Auspacken beschädigt", createdAt: new Date(Date.now() - DAY_MS / 4) },
      });
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stockQty: stock,
        isAvailable: derivedAvailability(stock, product.isAvailable, DEFAULT_SHOP_SAFETY_BUFFER),
        minStock: seed.minStock ?? null,
        reorderQty: seed.reorderQty ?? null,
        packSize: seed.packSize,
        purchasePriceRappen: seed.costRappen,
        defaultSupplierId: supplierId,
      },
    });
  }
  console.log(`Lager: ${suppliers.length} Lieferanten, ${stockSeeds.length} Artikel mit Bestand.`);
}

async function main() {
  assertValidSeedEans(products);
  const idBySlug = await seedCategories(categoryTree, null);
  await seedProducts(idBySlug);
  console.log(`Seed fertig: ${idBySlug.size} Kategorien, ${products.length} Produkte.`);
  await seedStock();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
