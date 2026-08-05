-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('piece', 'weight', 'volume');

-- CreateEnum
CREATE TYPE "ContentUnit" AS ENUM ('g', 'kg', 'ml', 'l', 'stk');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('ambient', 'chilled', 'frozen');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('openfoodfacts', 'manual', 'ai_extracted');

-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('front', 'ingredients', 'nutrition', 'other');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('existing_product', 'off_hit', 'off_miss');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "ean" TEXT,
    "sku" TEXT NOT NULL,
    "nameDe" TEXT NOT NULL,
    "nameOriginal" TEXT,
    "nameEn" TEXT,
    "brand" TEXT,
    "originCountry" TEXT,
    "categoryId" TEXT NOT NULL,
    "priceRappen" INTEGER NOT NULL,
    "vatRate" DECIMAL(3,1) NOT NULL DEFAULT 2.6,
    "unitType" "UnitType" NOT NULL,
    "contentAmount" DECIMAL(10,3),
    "contentUnit" "ContentUnit",
    "storageType" "StorageType" NOT NULL,
    "ingredientsDe" TEXT,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nutrition" JSONB,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "stockQty" INTEGER,
    "dataSource" "DataSource" NOT NULL,
    "dataComplete" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "ImageType" NOT NULL,
    "path" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceAttribution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "result" "ScanResult" NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffCache" (
    "barcode" TEXT NOT NULL,
    "rawJson" JSONB,
    "found" BOOLEAN NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffCache_pkey" PRIMARY KEY ("barcode")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_ean_key" ON "Product"("ean");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_nameOriginal_idx" ON "Product"("nameOriginal");

-- CreateIndex
CREATE INDEX "Product_isAvailable_idx" ON "Product"("isAvailable");

-- CreateIndex
CREATE INDEX "Product_dataComplete_idx" ON "Product"("dataComplete");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ScanLog_ean_idx" ON "ScanLog"("ean");

-- CreateIndex
CREATE INDEX "ScanLog_createdAt_idx" ON "ScanLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
