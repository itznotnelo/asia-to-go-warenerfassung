-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SyncOutbox" ADD COLUMN     "notBefore" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_archivedAt_idx" ON "Product"("archivedAt");
