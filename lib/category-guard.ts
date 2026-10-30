import "server-only";
import { prisma } from "@/lib/prisma";

export const CATEGORY_ERROR = "Bitte eine Unterkategorie wählen.";

/**
 * Only subcategories can hold products; top-level entries are group headings.
 * Checked server-side because a stale or forged categoryId would otherwise
 * end in an uncaught FK error or file products under a heading.
 */
export async function isAssignableCategory(categoryId: string): Promise<boolean> {
  return (await assignableCategory(categoryId)) !== null;
}

/** Same check, but returns the slugs a save needs for suggestKind(); null when not assignable. */
export async function assignableCategory(categoryId: string): Promise<{ slug: string; parentSlug: string } | null> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { slug: true, parent: { select: { slug: true } } },
  });
  if (!category?.parent) return null;
  return { slug: category.slug, parentSlug: category.parent.slug };
}
