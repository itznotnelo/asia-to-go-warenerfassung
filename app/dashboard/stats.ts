export interface ScanResultCounts {
  existing_product: number;
  off_hit: number;
  off_miss: number;
}

/**
 * OFF-Trefferquote misst nur echte OFF-Anfragen (neue Artikel), nicht Scans
 * bereits erfasster Artikel — für die ruft lookupBarcode() OFF gar nicht auf.
 * `null` statt 0%, solange noch keine OFF-Anfrage stattgefunden hat.
 */
export function computeOffHitRate(counts: ScanResultCounts): number | null {
  const attempts = counts.off_hit + counts.off_miss;
  if (attempts === 0) return null;
  return counts.off_hit / attempts;
}

export interface CategoryCount {
  categoryId: string;
  categoryName: string;
  parentName: string | null;
  count: number;
}

/** Baut die "Artikel pro Kategorie"-Liste, absteigend nach Anzahl sortiert. */
export function buildCategoryCounts(
  counts: Map<string, number>,
  categories: { id: string; name: string; parentName: string | null }[],
): CategoryCount[] {
  return categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      parentName: category.parentName,
      count: counts.get(category.id) ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}
