import { z } from "zod";
import { vatRateSchema } from "@/lib/product-schema";

// Backend order ids end up in a URL path (ackOrder) and a primary key, so
// only accept a conservative charset (cuid/uuid/"ord_..." style ids).
const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const pendingOrderItemSchema = z
  .object({
    productId: z.string().min(1).nullable(),
    nameDe: z.string(),
    qty: z.number().int().positive(),
    // Price/VAT snapshot (review #36). Optional: the backend stores
    // unit_price_rappen/line_total_rappen per item but /orders/pending does
    // not send them yet. Once it does, they must be consistent.
    sku: z.string().min(1).max(64).nullish(),
    unitPriceRappen: z.number().int().nonnegative().nullish(),
    lineTotalRappen: z.number().int().nonnegative().nullish(),
    vatRate: vatRateSchema.nullish(),
  })
  .refine((item) => (item.unitPriceRappen == null) === (item.lineTotalRappen == null), {
    message: "unitPriceRappen and lineTotalRappen come together or not at all",
  })
  .refine((item) => item.unitPriceRappen == null || item.lineTotalRappen === item.unitPriceRappen * item.qty, {
    message: "lineTotalRappen must be unitPriceRappen * qty",
  });

export const pendingOrderSchema = z
  .object({
    id: z.string().regex(ORDER_ID_RE),
    customerName: z.string(),
    customerPhone: z.string().nullable(),
    fulfilmentType: z.enum(["pickup", "delivery"]),
    totalRappen: z.number().int().nonnegative(),
    notes: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    items: z.array(pendingOrderItemSchema).min(1),
  })
  .superRefine((order, ctx) => {
    const priced = order.items.filter((item) => item.lineTotalRappen != null);
    if (priced.length === 0) return;
    if (priced.length !== order.items.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "line prices on some items but not all" });
      return;
    }
    // Backend total = sum of line totals (computeOrderTotals, no fees or
    // cash rounding online). A mismatch means the snapshot is wrong.
    const sum = priced.reduce((total, item) => total + (item.lineTotalRappen ?? 0), 0);
    if (sum !== order.totalRappen) {
      ctx.addIssue({ code: "custom", path: ["totalRappen"], message: `line totals add up to ${sum}, not ${order.totalRappen}` });
    }
  });

export type ValidPendingOrder = z.infer<typeof pendingOrderSchema>;

export interface InvalidPendingOrder {
  /** The raw id if it was at least a string, so the log can name the order. */
  id: string | null;
  error: string;
}

/**
 * Validates the /orders/pending list one order at a time (hard rule 4), so a
 * single malformed order is reported instead of rejecting the whole list.
 */
export function parsePendingOrders(raw: unknown): { valid: ValidPendingOrder[]; invalid: InvalidPendingOrder[] } {
  if (!Array.isArray(raw)) {
    return { valid: [], invalid: [{ id: null, error: "pending orders response is not an array" }] };
  }
  const valid: ValidPendingOrder[] = [];
  const invalid: InvalidPendingOrder[] = [];
  for (const entry of raw) {
    const result = pendingOrderSchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      const rawId = (entry as { id?: unknown } | null)?.id;
      invalid.push({ id: typeof rawId === "string" ? rawId : null, error: z.prettifyError(result.error) });
    }
  }
  return { valid, invalid };
}
