import { KIND_BY_SLUG, type SuggestedProductKind } from "@/electron/src/category-tree";
import type { CategoryOption } from "@/lib/category-option";

// Same values and order as enum ProductKind in prisma/schema.prisma.
export const PRODUCT_KINDS = ["food", "alcohol", "non_food", "cosmetics"] as const satisfies readonly SuggestedProductKind[];

export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const KIND_OPTIONS: readonly { kind: ProductKind; label: string }[] = [
  { kind: "food", label: "Lebensmittel" },
  { kind: "alcohol", label: "Alkoholisches Getränk" },
  { kind: "non_food", label: "Non-Food (Geschirr, Haushalt)" },
  { kind: "cosmetics", label: "Kosmetik" },
];

/**
 * Food and alcohol are Lebensmittel (LIV): ingredients, Nettomenge and checked
 * allergens are Pflichtangaben. Non-food and cosmetics have none of those.
 */
export function needsFoodLabelling(kind: ProductKind): boolean {
  return kind === "food" || kind === "alcohol";
}

// Keyed on the slug like suggestVatRate, so renaming a category can't flip the kind.
export function suggestKind(category: Pick<CategoryOption, "slug" | "parentSlug"> | null | undefined): ProductKind {
  if (!category) return "food";
  const own = KIND_BY_SLUG.get(category.slug);
  const inherited = category.parentSlug ? KIND_BY_SLUG.get(category.parentSlug) : undefined;
  return own ?? inherited ?? "food";
}
