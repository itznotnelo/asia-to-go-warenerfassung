import type { Prisma } from "@/lib/generated/prisma/client";

export interface ProductListFilters {
  q?: string;
  categoryId?: string;
  storageType?: string;
  dataSource?: string;
  /** "true" | "false" | undefined (= alle) */
  complete?: string;
  /** "true" = nur gelöschte (Papierkorb); sonst nur aktive Artikel. */
  archived?: string;
}

const STORAGE_TYPES = new Set(["ambient", "chilled", "frozen"]);
const DATA_SOURCES = new Set(["openfoodfacts", "manual", "ai_extracted"]);

export function buildProductWhere(filters: ProductListFilters): Prisma.ProductWhereInput {
  // Soft-deleted articles (review should #34) only show up in the "Gelöscht" view.
  const where: Prisma.ProductWhereInput = {
    archivedAt: filters.archived === "true" ? { not: null } : null,
  };

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { nameDe: { contains: q, mode: "insensitive" } },
      { nameOriginal: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { ean: { contains: q } },
    ];
  }

  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.storageType && STORAGE_TYPES.has(filters.storageType)) {
    where.storageType = filters.storageType as Prisma.ProductWhereInput["storageType"];
  }
  if (filters.dataSource && DATA_SOURCES.has(filters.dataSource)) {
    where.dataSource = filters.dataSource as Prisma.ProductWhereInput["dataSource"];
  }
  if (filters.complete === "true") where.dataComplete = true;
  if (filters.complete === "false") where.dataComplete = false;

  return where;
}
