import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { ProductSummary } from "@/lib/product-summary";

export type LookupResult =
  | { kind: "existing"; product: ProductSummary }
  | { kind: "off-hit"; ean: string; mapped: MappedOffProduct }
  | { kind: "off-miss"; ean: string }
  | { kind: "off-error"; ean: string };
