import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CATEGORY_ERROR, isAssignableCategory } from "@/lib/category-guard";
import { vatRateSchema } from "@/lib/product-schema";
import { enqueueProductSync } from "@/lib/sync/outbox";
import { triggerBackgroundDrain } from "@/lib/sync/runner";

export const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1).optional(),
  vatRate: vatRateSchema.optional(),
  isAvailable: z.boolean().optional(),
});

export type BulkUpdateResult = { ok: true; count: number } | { ok: false; message: string };

/**
 * Bulk-Aktionen aus der Artikelliste. Jede Änderung (Kategorie, MwSt,
 * Verfügbarkeit) ist Teil des Shop-Payloads, deshalb wird jeder betroffene
 * Artikel neu zur Veröffentlichung angemeldet, nicht nur bei isAvailable.
 */
export async function applyBulkUpdate(rawInput: unknown): Promise<BulkUpdateResult> {
  const parsed = bulkUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  }
  const { ids, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "Keine Änderung ausgewählt." };
  }
  if (patch.categoryId !== undefined && !(await isAssignableCategory(patch.categoryId))) {
    return { ok: false, message: CATEGORY_ERROR };
  }

  const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: patch });

  if (result.count > 0) {
    for (const id of ids) {
      await enqueueProductSync(id);
    }
    triggerBackgroundDrain();
  }

  return { ok: true, count: result.count };
}
