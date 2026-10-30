-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShopOrderStatus" ADD VALUE 'collected';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'cancelled';

-- CreateEnum
CREATE TYPE "FulfilmentType" AS ENUM ('pickup', 'delivery');

-- AlterTable
-- Edited after `prisma migrate dev --create-only`: Prisma drops and re-adds the
-- column for String -> enum, which would lose every imported order's value.
-- Cast in place instead; the backend only ever stores 'pickup' or 'delivery'.
ALTER TABLE "ShopOrder" ALTER COLUMN "fulfilmentType" TYPE "FulfilmentType" USING ("fulfilmentType"::"FulfilmentType");

-- AlterTable
ALTER TABLE "ShopOrderItem" ADD COLUMN     "lineTotalRappen" INTEGER,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "unitPriceRappen" INTEGER,
ADD COLUMN     "vatRate" DECIMAL(3,1);

-- CreateTable
CREATE TABLE "SkuCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL,

    CONSTRAINT "SkuCounter_pkey" PRIMARY KEY ("id")
);

-- Seed the counter from the highest ASIA-xxxxx already issued (numeric, not
-- text order), so the first new product continues the existing numbering.
INSERT INTO "SkuCounter" ("id", "value")
SELECT 1, COALESCE(MAX(CAST(SUBSTRING("sku" FROM 6) AS INTEGER)), 0)
FROM "Product"
WHERE "sku" ~ '^ASIA-[0-9]{1,9}$';
