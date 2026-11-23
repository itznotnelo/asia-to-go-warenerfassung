import "server-only";
import type { Prisma, StockMovement } from "@/lib/generated/prisma/client";
import { enqueueProductSync } from "@/lib/sync/outbox";
import { DEFAULT_SHOP_SAFETY_BUFFER, derivedAvailability } from "./availability";
import { canUndoType, checkMovementQuantity, movementTypeLabel, type StockMovementType, type WasteReason } from "./movement-rules";

// The stock ledger. Every stock change goes through bookMovement() inside a
// transaction: lock the product row, append one StockMovement, write the new
// cached Product.stockQty and, if the webshop availability flips, the derived
// isAvailable plus its outbox row. Invariant (tested in
// ledger.integration.test.ts): for a tracked product (stockQty not null),
// stockQty = SUM(StockMovement.quantity).

/** A $transaction client. Pass the same one to every call that must commit together. */
export type StockDb = Prisma.TransactionClient;

/** A refusal with a German message for the UI (validation, not a crash). */
export class StockError extends Error {}

export interface MovementInput {
  productId: string;
  type: StockMovementType;
  /** Signed, in stock units. */
  quantity: number;
  unitCostRappen?: number | null;
  wasteReason?: WasteReason | null;
  note?: string | null;
  supplierId?: string | null;
  lotId?: string | null;
  shopOrderId?: string | null;
  goodsReceiptId?: string | null;
  stocktakeId?: string | null;
  reversesId?: string | null;
}

export interface BookedMovement {
  movement: StockMovement;
  stockBefore: number;
  stockAfter: number;
  /** Webshop availability changed with this movement (product re-queued for sync). */
  availabilityChanged: boolean;
}

interface LockedProduct {
  id: string;
  stockQty: number | null;
  isAvailable: boolean;
}

export async function getSafetyBuffer(db: StockDb): Promise<number> {
  const settings = await db.stockSettings.findUnique({ where: { id: 1 } });
  return settings?.shopSafetyBuffer ?? DEFAULT_SHOP_SAFETY_BUFFER;
}

/** Row lock until the transaction ends, so two bookings on one article run one after the other. */
async function lockProduct(db: StockDb, productId: string): Promise<LockedProduct | null> {
  const rows = await db.$queryRaw<LockedProduct[]>`
    SELECT "id", "stockQty", "isAvailable" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  return rows[0] ?? null;
}

export async function ledgerSum(db: StockDb, productId: string): Promise<number> {
  const result = await db.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } });
  return result._sum.quantity ?? 0;
}

/**
 * Writes the cached stock without touching updatedAt (a sale is not an
 * article edit). Only when the webshop availability flips is the product
 * updated through Prisma, which bumps updatedAt so the backend accepts the
 * new payload as newer, and re-queued for the shop sync in the same transaction.
 */
async function writeStock(db: StockDb, product: LockedProduct, stockQty: number | null, buffer: number): Promise<boolean> {
  await db.$executeRaw`UPDATE "Product" SET "stockQty" = ${stockQty} WHERE "id" = ${product.id}`;
  const available = derivedAvailability(stockQty, product.isAvailable, buffer);
  if (available === product.isAvailable) return false;
  await db.product.update({ where: { id: product.id }, data: { isAvailable: available } });
  await enqueueProductSync(product.id, db);
  return true;
}

/** Stock now: the cached value, or the ledger sum for a product that isn't tracked yet. */
async function currentStock(db: StockDb, product: LockedProduct): Promise<number> {
  return product.stockQty ?? (await ledgerSum(db, product.id));
}

/**
 * Appends one movement. A product without tracking starts tracking with it
 * (stock = ledger sum + quantity). Negative stock is allowed (the shop sells
 * what it has on the shelf even if the app disagrees); the UI flags it.
 */
export async function bookMovement(db: StockDb, input: MovementInput, buffer: number): Promise<BookedMovement> {
  const problem = checkMovementQuantity(input.type, input.quantity, Boolean(input.reversesId));
  if (problem) throw new StockError(problem);
  if (input.unitCostRappen != null && (!Number.isSafeInteger(input.unitCostRappen) || input.unitCostRappen < 0)) {
    throw new StockError("Einkaufspreis ungültig.");
  }

  const product = await lockProduct(db, input.productId);
  if (!product) throw new StockError("Artikel nicht gefunden.");
  const stockBefore = await currentStock(db, product);
  const stockAfter = stockBefore + input.quantity;
  if (!Number.isSafeInteger(stockAfter)) throw new StockError("Menge zu gross.");

  const movement = await db.stockMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      stockAfter,
      unitCostRappen: input.unitCostRappen ?? null,
      wasteReason: input.wasteReason ?? null,
      note: input.note?.trim() || null,
      supplierId: input.supplierId ?? null,
      lotId: input.lotId ?? null,
      shopOrderId: input.shopOrderId ?? null,
      goodsReceiptId: input.goodsReceiptId ?? null,
      stocktakeId: input.stocktakeId ?? null,
      reversesId: input.reversesId ?? null,
      // Set here, not by the DB default: now() is the transaction start, so
      // every movement of one booking would get the same timestamp.
      createdAt: new Date(),
    },
  });
  const availabilityChanged = await writeStock(db, product, stockAfter, buffer);
  return { movement, stockBefore, stockAfter, availabilityChanged };
}

/** Books the opposite of a movement (same type, same links), pointing at it via reversesId. */
export async function reverseMovement(db: StockDb, original: StockMovement, buffer: number, note: string): Promise<BookedMovement> {
  return bookMovement(
    db,
    {
      productId: original.productId,
      type: original.type,
      quantity: -original.quantity,
      wasteReason: original.wasteReason,
      note,
      supplierId: original.supplierId,
      lotId: original.lotId,
      shopOrderId: original.shopOrderId,
      goodsReceiptId: original.goodsReceiptId,
      stocktakeId: original.stocktakeId,
      reversesId: original.id,
    },
    buffer,
  );
}

/**
 * "Rückgängig" for the newest movement of an article. Append-only: books a
 * reversal instead of deleting. Refused for an older movement (later ones
 * built on it), an undo, something already undone, and web sales (those go
 * back by cancelling the order).
 */
export async function undoMovement(db: StockDb, movementId: string, buffer: number): Promise<BookedMovement> {
  const movement = await db.stockMovement.findUnique({ where: { id: movementId }, include: { reversedBy: { select: { id: true } } } });
  if (!movement) throw new StockError("Buchung nicht gefunden.");
  if (movement.reversesId) throw new StockError("Eine Rückgängig-Buchung kann nicht rückgängig gemacht werden.");
  if (movement.reversedBy) throw new StockError("Diese Buchung wurde schon rückgängig gemacht.");
  if (!canUndoType(movement.type)) throw new StockError("Webshop-Verkäufe gehen über «Bestellung stornieren» zurück.");

  await lockProduct(db, movement.productId);
  const newest = await db.stockMovement.findFirst({
    where: { productId: movement.productId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (newest?.id !== movement.id) {
    throw new StockError("Nur die letzte Buchung dieses Artikels kann rückgängig gemacht werden.");
  }
  return reverseMovement(db, movement, buffer, `Rückgängig: ${movementTypeLabel(movement.type)}`);
}

/**
 * Turns stock tracking on (stock = ledger sum, availability from stock) or
 * off (stockQty null, the manual flag stays as it was last derived).
 */
export async function setStockTracking(db: StockDb, productId: string, tracked: boolean, buffer: number): Promise<void> {
  const product = await lockProduct(db, productId);
  if (!product) throw new StockError("Artikel nicht gefunden.");
  if ((product.stockQty !== null) === tracked) return;
  await writeStock(db, product, tracked ? await ledgerSum(db, productId) : null, buffer);
}

/** After the safety buffer changed: re-derive availability of every tracked article. Returns how many flipped. */
export async function refreshAllAvailability(db: StockDb, buffer: number): Promise<number> {
  const tracked = await db.product.findMany({ where: { stockQty: { not: null } }, select: { id: true, stockQty: true, isAvailable: true } });
  let changed = 0;
  for (const product of tracked) {
    const available = derivedAvailability(product.stockQty, product.isAvailable, buffer);
    if (available === product.isAvailable) continue;
    await db.product.update({ where: { id: product.id }, data: { isAvailable: available } });
    await enqueueProductSync(product.id, db);
    changed += 1;
  }
  return changed;
}
