import { z } from "zod";
import { MOVEMENT_TYPES, WASTE_REASONS } from "./movement-rules";
import { parseDateOnly } from "./dates";

// Zod schemas for every stock action input (the browser is outside the trust
// boundary like any other external data). Quantities arrive already parsed
// into stock units by the client (lib/stock/units.ts parseQtyInput).

const id = z.string().min(1).max(64);
const qty = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const positiveQty = z.number().int().min(1).max(1_000_000_000);
const rappen = z.number().int().min(0).max(100_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullish();

export const dateOnlySchema = z
  .string()
  .refine((value) => parseDateOnly(value) !== null, "Datum ungültig")
  .transform((value) => parseDateOnly(value) as Date);

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  contactName: optionalText(120),
  phone: optionalText(60),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === "" || z.email().safeParse(value).success, "E-Mail ungültig")
    .transform((value) => value || null)
    .nullish(),
  customerNumber: optionalText(60),
  notes: optionalText(2000),
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const productStockSettingsSchema = z.object({
  productId: id,
  tracked: z.boolean(),
  minStock: z.number().int().min(0).max(1_000_000_000).nullable(),
  reorderQty: z.number().int().min(1).max(1_000_000_000).nullable(),
  packSize: z.number().int().min(1).max(100_000),
  purchasePriceRappen: rappen.nullable(),
  defaultSupplierId: id.nullable(),
});

export const productMovementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waste"), productId: id, quantity: positiveQty, wasteReason: z.enum(WASTE_REASONS), note: optionalText(500) }),
  z.object({ kind: z.literal("return"), productId: id, quantity: positiveQty, supplierId: id.nullable(), note: optionalText(500) }),
  // Absolute: the stock that is really there; the difference is booked.
  z.object({ kind: z.literal("correction"), productId: id, countedQty: qty, note: optionalText(500) }),
  z.object({ kind: z.literal("manual"), productId: id, quantity: qty, note: z.string().trim().min(1, "Bitte kurz notieren, warum.").max(500) }),
]);

export const writeOffLotSchema = z.object({ lotId: id, wasteReason: z.enum(WASTE_REASONS) });
export const movementIdSchema = z.object({ movementId: id });

export const createReceiptSchema = z.object({ supplierId: id.nullable(), deliveryNote: optionalText(120) });

export const receiptLineSchema = z.object({
  receiptId: id,
  productId: id,
  packs: positiveQty,
  packSize: z.number().int().min(1).max(100_000),
  unitCostRappen: rappen.nullable(),
  expiryDate: dateOnlySchema.nullable(),
  batchCode: optionalText(60),
});

export const receiptLineIdSchema = z.object({ lineId: id });
export const documentIdSchema = z.object({ id });

export const createStocktakeSchema = z.object({ title: z.string().trim().min(1, "Bitte benennen, z.B. «Regal 3»").max(120), categoryId: id.nullable() });

export const countLineSchema = z.object({
  stocktakeId: id,
  productId: id,
  /** "set" = the typed count, "add" = one more scan of the same article. */
  mode: z.enum(["set", "add"]),
  quantity: z.number().int().min(0).max(1_000_000_000),
});

export const stocktakeLineIdSchema = z.object({ stocktakeId: id, productId: id });

export const shopSaleSchema = z.object({ productId: id, quantity: positiveQty });

export const movementFilterSchema = z.object({ type: z.enum(MOVEMENT_TYPES).nullish() });

export const safetyBufferSchema = z.object({ shopSafetyBuffer: z.number().int().min(0).max(9999) });

export const cancelOrderSchema = z.object({ orderId: id });
