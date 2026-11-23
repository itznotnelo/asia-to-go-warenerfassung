-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('food', 'alcohol', 'non_food', 'cosmetics');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'food';

-- Edited after `prisma migrate dev --create-only`: give existing rows the kind
-- their category suggests (electron/src/category-tree.ts KIND_BY_SLUG), so a
-- steamer already filed under Non-Food is not stuck behind food rules. A new
-- save or image upload recomputes dataComplete with the new rules.
UPDATE "Product" AS p
SET "kind" = CASE
    WHEN c."slug" = 'alkohol' THEN 'alcohol'::"ProductKind"
    WHEN c."slug" = 'kosmetik-koerperpflege' THEN 'cosmetics'::"ProductKind"
    ELSE 'non_food'::"ProductKind"
  END
FROM "Category" AS c
LEFT JOIN "Category" AS parent ON parent."id" = c."parentId"
WHERE c."id" = p."categoryId"
  AND (c."slug" IN ('alkohol', 'kosmetik-koerperpflege', 'non-food') OR parent."slug" = 'non-food');
