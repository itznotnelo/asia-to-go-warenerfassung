-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allergensConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "traces" TEXT[] DEFAULT ARRAY[]::TEXT[];
