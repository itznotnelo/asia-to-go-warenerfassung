import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { ProductSummary } from "@/lib/product-summary";

export type LookupResult =
  | { kind: "existing"; product: ProductSummary }
  // The EAN belongs to a "gelöschter" article; the unique EAN blocks a new one, so offer Wiederherstellen.
  | { kind: "archived"; product: ProductSummary }
  | { kind: "off-hit"; ean: string; mapped: MappedOffProduct }
  | { kind: "off-miss"; ean: string }
  | { kind: "off-error"; ean: string };
