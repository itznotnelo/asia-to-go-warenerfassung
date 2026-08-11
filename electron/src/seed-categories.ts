import { randomUUID } from "node:crypto";
import { Client } from "pg";
import log from "electron-log";

interface CategorySeed {
  name: string;
  slug: string;
  sortOrder: number;
  children?: CategorySeed[];
}

// Mirrors prisma/seed.ts's category tree — but NOT its demo products. A real
// shop's inventory shouldn't start pre-loaded with example products, but an
// empty category list would block scanning the very first real product.
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

async function insertCategory(
  client: Client,
  category: CategorySeed,
  parentId: string | null,
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "Category" (id, name, slug, "sortOrder", "parentId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [randomUUID(), category.name, category.slug, category.sortOrder, parentId],
  );

  const id = rows[0]?.id ?? (await client.query(`SELECT id FROM "Category" WHERE slug = $1`, [category.slug])).rows[0].id;

  for (const child of category.children ?? []) {
    await insertCategory(client, child, id);
  }
}

export async function seedCategoriesIfEmpty(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "Category"`);
    if (rows[0].count > 0) {
      log.info("Categories already exist, skipping seed.");
      return;
    }
    log.info("Seeding category tree...");
    for (const category of categoryTree) {
      await insertCategory(client, category, null);
    }
    log.info("Category tree seeded.");
  } finally {
    await client.end();
  }
}
