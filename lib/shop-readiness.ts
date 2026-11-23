import { needsFoodLabelling, type ProductKind } from "@/lib/product-kind";

/**
 * One list of what an article still needs before the webshop shows it. The
 * dataComplete flag (lib/product-schema.ts) is derived from this list, so the
 * text Papa reads and the flag the sync uses can never disagree.
 */
export type MissingKey = "name" | "price" | "content" | "ingredients" | "allergens" | "image";

export interface ReadinessFields {
  nameDe: string;
  priceRappen: number;
  kind: ProductKind;
  unitType: "piece" | "weight" | "volume";
  contentAmount?: number | null;
  contentUnit?: string | null;
  ingredientsDe?: string | null;
  allergensConfirmed: boolean;
}

/** Short German labels, in the order the edit page shows the fields. */
export const MISSING_LABELS: Record<MissingKey, string> = {
  name: "Name",
  price: "Preis",
  image: "Foto",
  content: "Inhalt (Menge und Einheit)",
  ingredients: "Zutaten",
  allergens: "Allergene prüfen",
};

const ORDER: MissingKey[] = ["name", "price", "image", "content", "ingredients", "allergens"];

export function missingForShop(fields: ReadinessFields, hasImage: boolean): MissingKey[] {
  const missing = new Set<MissingKey>();
  if (!fields.nameDe) missing.add("name");
  if (!(fields.priceRappen > 0)) missing.add("price");
  if (!hasImage) missing.add("image");

  const hasContent = Boolean(fields.contentAmount && fields.contentUnit);
  if (needsFoodLabelling(fields.kind)) {
    if (!hasContent) missing.add("content");
    if (!fields.ingredientsDe) missing.add("ingredients");
    if (!fields.allergensConfirmed) missing.add("allergens");
  } else if (fields.unitType !== "piece" && !hasContent) {
    // Non-food and cosmetics: no LIV labelling. Content only where a Grundpreis is due.
    missing.add("content");
  }
  return ORDER.filter((key) => missing.has(key));
}

export function missingLabels(keys: readonly MissingKey[]): string[] {
  return keys.map((key) => MISSING_LABELS[key]);
}

export type ShopState = "visible" | "hidden-unavailable" | "incomplete" | "archived";

/**
 * What the UI says about an article. Takes the live missing-list instead of the
 * stored dataComplete flag, so an article saved before "Allergene geprüft"
 * existed reads as incomplete here, exactly as isEligibleForShop() treats it.
 */
export function shopState(product: { missingCount: number; isAvailable: boolean; archived?: boolean }): ShopState {
  if (product.archived) return "archived";
  if (product.missingCount > 0) return "incomplete";
  return product.isAvailable ? "visible" : "hidden-unavailable";
}

export const SHOP_STATE_LABELS: Record<ShopState, string> = {
  visible: "Im Webshop sichtbar",
  "hidden-unavailable": "Vollständig, aber als nicht verfügbar markiert",
  incomplete: "Noch nicht im Webshop",
  archived: "Gelöscht",
};
