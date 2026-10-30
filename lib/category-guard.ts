import "server-only";
import { prisma } from "@/lib/prisma";

export const CATEGORY_ERROR = "Bitte eine Unterkategorie wählen.";

/**
 * Only subcategories can hold products; top-level entries are group headings.
 * Checked server-side because a stale or forged categoryId would otherwise
 * end in an uncaught FK error or file products under a heading.
 */
export async function isAssignableCategory(categoryId: string): Promise<boolean> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { parentId: true } });
  return category !== null && category.parentId !== null;
}
