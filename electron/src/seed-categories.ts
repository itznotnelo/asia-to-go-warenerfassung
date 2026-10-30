import { randomUUID } from "node:crypto";
import { Client } from "pg";
import log from "electron-log";
import { categoryTree, type CategorySeed } from "./category-tree";

// Same category tree as prisma/seed.ts (both import category-tree.ts), but NOT its
// demo products. A real shop's inventory shouldn't start pre-loaded with example
// products, but an empty category list would block scanning the very first real product.

/** Returns how many rows were new (this one plus its children). */
async function insertCategory(
  client: Client,
  category: CategorySeed,
  parentId: string | null,
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "Category" (id, name, slug, "sortOrder", "parentId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [randomUUID(), category.name, category.slug, category.sortOrder, parentId],
  );

  let inserted = rows.length;
  const id = rows[0]?.id ?? (await client.query(`SELECT id FROM "Category" WHERE slug = $1`, [category.slug])).rows[0].id;

  for (const child of category.children ?? []) {
    inserted += await insertCategory(client, child, id);
  }
  return inserted;
}

/**
 * Runs on every boot: adds categories that are new in category-tree.ts (e.g. Kosmetik
 * on an install seeded before it existed). Existing rows are left alone (ON CONFLICT
 * DO NOTHING), and the app has no category editor, so nothing the shop changed is undone.
 */
export async function seedMissingCategories(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let inserted = 0;
    for (const category of categoryTree) {
      inserted += await insertCategory(client, category, null);
    }
    log.info(inserted > 0 ? `Category tree: ${inserted} new categories added.` : "Category tree up to date.");
  } finally {
    await client.end();
  }
}
